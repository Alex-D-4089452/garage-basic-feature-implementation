# Note Sharing — Flow and UI States

## Scope

- **View-only sharing**: recipients can read a shared note but cannot edit or delete it.
- **Recipient must already have an account**: the recipient is resolved by email through Firebase Auth.
- **Soft revoke**: share records are marked with `revokedAt`; they are never hard-deleted.
- **Server-authoritative writes**: sharing and revoking go through Server Actions using the Admin SDK.
  Clients cannot write directly to `noteShares`.
- **Live UI**: Firestore `onSnapshot` subscriptions update the owner's collaborator list and the
  recipient's "Shared with me" list without a refresh.

---

## 1. UI state flow

```mermaid
flowchart LR
    classDef loading fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef empty fill:#f3f4f6,stroke:#6b7280,color:#374151
    classDef error fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef success fill:#dcfce7,stroke:#16a34a,color:#14532d

    subgraph SHARE[Owner - Share note]
        direction TB
        O1["Share dialog"] --> O2{"Load collaborators"}
        O2 -->|loading| OL["Loading"]:::loading
        O2 -->|error| OE["Error: load failed"]:::error
        O2 -->|empty| O4["Enter recipient email"]
        O2 -->|success| OS["Collaborator list"]:::success

        OL --> O2
        OE -->|Retry| O2

        OS --> O4
        O4 --> O5["Sharing: input disabled"]:::loading
        O5 --> O6{"Share result"}
        O6 -->|success| OSucc["Success: added, list refreshed"]:::success
        O6 -->|error| OErr["Error: not found / self / duplicate / cap / write"]:::error
        OErr --> O4
    end

    subgraph MANAGE[Owner - Access list]
        direction TB
        OM["Collaborator list"]:::success
        OM --> O7{"Remove collaborator?"}
        O7 -->|cancel| OM
        O7 -->|confirm| OR["Revoking: row disabled"]:::loading
        OR --> O8{"Revoke result"}
        O8 -->|success| ORS["Access removed"]:::success
        O8 -->|error| ORE["Error: still shared"]:::error
        ORE -->|Retry| O7
        ORS -->|sync| LR["Live: note disappears"]:::error
        LA["Live: note appears"]:::success
    end

    subgraph RECIPIENT[Recipient - Shared with me]
        direction TB
        R1["Shared with me"] --> R2{"Load shared notes"}
        R2 -->|loading| RL["Loading"]:::loading
        R2 -->|error| RE["Error: load failed"]:::error
        R2 -->|empty| REm["Nothing shared yet"]:::empty
        R2 -->|success| RS["Read-only note list"]:::success

        RL --> R2
        RE -->|Retry| R2
        RS --> R3["Open note"]
        R3 --> R3L["Loading note"]:::loading --> R4["Read-only view"]
        R3 -.->|fetch error| R3E["Error: not found / no access"]:::error --> R2
        R4 --> R4a["Owner, updated, no edit controls"] --> R5["Back to list"] --> R2
        R4 -.->|owner revokes| R6["Access removed alert"]:::error --> R6b["Return to list"] --> R2
        R4 -.->|owner deletes| R7["Note unavailable alert"]:::error --> R7b["Return to list"] --> R2
        R4 -.->|session expires| R12["Redirect to sign in"]:::error
        R2 -.->|session expires| R12
    end

    OS -.->|manage| OM
    OSucc -.->|new note| LA
    LA -.->|live update| R2
    LR -.->|live update| R2
```

**Legend:** blue = loading, gray = empty, red = error, green = success.

The diagram shows the primary tab flow. Direct-link loading/error states and owner
soft-delete cleanup are covered in the checklist and key transitions below.

---

## 2. End-to-end sequence

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant UI as Owner UI
    participant SA as Notes Server Actions
    participant Auth as Firebase Auth Admin
    participant FS as Firestore
    actor Recipient
    participant RUI as Recipient UI

    Owner->>UI: Open Share dialog
    UI->>FS: Subscribe to noteShares where ownerUid == me
    alt loading
        FS-->>UI: pending
        UI-->>Owner: Loading collaborators
    else error
        FS-->>UI: permission or network error
        UI-->>Owner: Error and Retry
    else empty
        FS-->>UI: no active shares
        UI-->>Owner: No collaborators yet
    else success
        FS-->>UI: active share docs
        UI-->>Owner: Collaborator list
    end

    Owner->>UI: Enter email and click Share
    UI->>SA: shareNote(noteId, email)
    SA->>SA: requireAuth and validate input
    SA->>FS: Read note by ID
    alt note missing, not owner, or soft-deleted
        SA-->>UI: error: Note not found
        UI-->>Owner: Error toast, keep input
    else owner verified
        SA->>Auth: getUserByEmail(email)
        alt user not found
            Auth-->>SA: user-not-found
            SA-->>UI: error: No account found
            UI-->>Owner: Error, keep input
        else self-share, duplicate, or cap exceeded
            SA-->>UI: error: validation message
            UI-->>Owner: Error, keep input
        else recipient valid
            SA->>FS: Transaction: arrayUnion on note and upsert noteShare
            alt transaction fails
                FS-->>SA: write error
                SA-->>UI: error: Failed to share note
                UI-->>Owner: Error toast, retry
            else transaction committed
                FS-->>SA: ok
                SA-->>UI: success
                UI-->>Owner: Toast, collaborator added, input cleared
                FS-->>RUI: Live snapshot: shared note appears
                RUI-->>Recipient: Note visible in Shared with me
            end
        end
    end

    Owner->>UI: Remove collaborator
    UI->>SA: unshareNote(noteId, recipientUid)
    SA->>FS: Verify ownership, then arrayRemove and soft-revoke share
    alt revoke fails
        FS-->>SA: write error
        SA-->>UI: error: Failed to remove collaborator
        UI-->>Owner: Error, collaborator remains
    else revoked
        FS-->>SA: ok
        SA-->>UI: success
        UI-->>Owner: Collaborator removed
        FS-->>RUI: Live snapshot: shared note disappears
        RUI-->>Recipient: Note removed from Shared with me
    end
```

---

## 3. State coverage checklist

| Surface                      | Loading                                                             | Empty                                                     | Error                                               | Success                                                    |
| ---------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Share dialog — collaborators | Spinner/skeleton; actions disabled                                  | “No one else has access yet”, email input still available | “Couldn’t load collaborators” + Retry               | Collaborator rows with remove actions                      |
| Share submit                 | Button spinner, input disabled                                      | —                                                         | Inline/toast error; keep email so it can be retried | Toast “Shared with X”; input cleared; collaborator appears |
| Remove collaborator          | Row spinner, remove button disabled                                 | —                                                         | Toast “Couldn’t remove access”; row remains         | Toast “Access removed”; row disappears                     |
| Shared with me               | Skeleton/spinner                                                    | “Notes shared with you will appear here”                  | “Couldn’t load shared notes” + Retry                | Read-only note cards                                       |
| Shared note view             | Renders from the list; show spinner only if opened via a direct URL | —                                                         | Direct-URL fetch failure: error + Back/Retry        | Title, body, owner name; no edit/delete controls           |

---

## Key transitions

- **Share succeeds**: the transaction updates `notes.sharedWithUids` and creates/updates the
  `noteShares` document. The recipient’s live `array-contains` query picks up the note without a
  refresh.
- **Revoke succeeds**: `sharedWithUids` loses the UID and the share document gets `revokedAt` set.
  The recipient’s list updates live and security rules deny further access.
- **Owner soft-deletes**: shares are cleared/revoked in the same server operation, so recipients
  immediately lose access.
- **Session expires**: `requireAuth()` redirects to sign-in; the UI should treat this as a
  terminal error rather than an inline retry.
- **All share writes go through Server Actions**: client writes to `noteShares` are denied by
  rules, so the UI cannot bypass recipient lookup or ownership checks.

---

## Data touched

| Collection                           | Access        | Purpose                                                                 |
| ------------------------------------ | ------------- | ----------------------------------------------------------------------- |
| `notes/{noteId}`                     | Read + update | Existing note; `sharedWithUids` is the queryable access list.           |
| `noteShares/{noteId}_{recipientUid}` | Read + write  | Collaborator metadata, owner display name, and `revokedAt` audit state. |
| `users/{uid}`                        | Read          | Optional display-name lookup server-side; Auth resolves the recipient.  |

---

## Implementation checklist

- [ ] Add `sharedWithUids?: string[]` and `NoteShare` to the Firestore types and schema docs.
- [ ] Add `shareNote`, `unshareNote`, and share cleanup in `deleteNote` as Server Actions.
- [ ] Update Firestore rules for owner-or-shared note reads and owner/recipient share reads.
- [ ] Build the share dialog with loading, empty, error, and success states.
- [ ] Add the “Shared with me” tab and read-only shared note view.
- [ ] Add action, component, and rules tests covering the error paths above.
- [ ] Verify the two-account demo, including live share and revoke updates.
