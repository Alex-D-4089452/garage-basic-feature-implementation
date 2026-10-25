# Note Sharing — Flow and UI States

## Scope

- **View-only sharing**: recipients can read a shared note but cannot edit or delete it.
- **Recipient must already have an account**: the recipient is resolved by email through Firebase Auth.
- **Soft revoke**: share records are marked with `revokedAt`; they are never hard-deleted.
- **Review tracking**: recipients can mark a shared note as reviewed; the owner sees each active
  collaborator's review status.
- **Comments**: the note owner and active recipients can add comments. Comments are append-only
  (no edit or delete flow in this version).
- **Server-authoritative writes**: sharing, revoking, review changes, and comment creation go
  through Server Actions using the Admin SDK. Clients cannot write `noteShares` or `noteComments`.
- **Live UI**: Firestore `onSnapshot` subscriptions update the owner's collaborator list, review
  status, comment list, and the recipient's "Shared with me" list without a refresh.

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
        O4 --> O4v{"Validate email"}
        O4v -->|invalid| O4e["Error: invalid email format"]:::error
        O4e --> O4
        O4v -->|valid| O5["Sharing: input disabled"]:::loading
        O5 --> O6{"Share result"}
        O6 -->|success| OSucc["Success: added, list refreshed"]:::success
        O6 -->|error| OErr["Error: not found / self / duplicate / cap / write"]:::error
        OErr --> O4
    end

    subgraph MANAGE[Owner - Access list]
        direction TB
        OM["Collaborator list"]:::success
        OM --> O9["Review status per collaborator\nReviewed / Not reviewed yet"]:::success
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
        R4 --> R4a["Owner, body, review tick, comments\nno edit controls"]
        R4a --> R4b{"Review tick"}
        R4b -->|mark| R4c["Reviewed; owner sees status"]:::success
        R4b -->|clear| R4d["Not reviewed"]:::empty
        R4a --> R4e{"Comments"}
        R4e -->|loading| R4f["Loading comments"]:::loading
        R4e -->|empty| R4g["No comments yet"]:::empty
        R4e -->|error| R4h["Couldn't load comments + Retry"]:::error
        R4e -->|success| R4i["Chronological comment list"]:::success
        R4i --> R4j["Add comment:\nposting / error / success"]:::success
        R4a --> R5["Back to list"] --> R2
        R4 -.->|owner revokes| R6["Access removed alert"]:::error --> R6b["Return to list"] --> R2
        R4 -.->|owner deletes| R7["Note unavailable alert"]:::error --> R7b["Return to list"] --> R2
        R4 -.->|session expires| R12["Redirect to sign in"]:::error
        R2 -.->|session expires| R12
    end

    OS -.->|manage| OM
    OSucc -.->|new note| LA
    LA -.->|live update| R2
    LR -.->|live update| R2
    R4c -.->|live update| O9
    R4j -.->|live update| O9
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
            SA->>FS: Transaction: add recipient to note and upsert noteShare
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
    SA->>FS: Verify ownership, then remove recipient and soft-revoke share
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

    Recipient->>RUI: Click review tick
    RUI->>SA: setNoteReviewed(noteId, reviewed)
    SA->>FS: Verify active note and active recipient share
    alt not a participant, revoked, or note deleted
        SA-->>RUI: error: Note not found / Share not found
        RUI-->>Recipient: Error toast, tick unchanged
    else valid recipient
        SA->>FS: Update noteShares.reviewedAt
        FS-->>RUI: Live snapshot: tick updated
        FS-->>UI: Live snapshot: owner sees Reviewed
        RUI-->>Recipient: Success toast
    end

    Recipient->>RUI: Add comment
    RUI->>SA: addNoteComment(noteId, body)
    SA->>FS: Verify owner or active recipient
    alt invalid input or no access
        SA-->>RUI: error: validation / Note not found
        RUI-->>Recipient: Inline error, keep text
    else participant
        SA->>FS: Create noteComments document
        FS-->>RUI: Live snapshot: comment appears
        FS-->>UI: Live snapshot: owner sees comment
        RUI-->>Recipient: Toast, form cleared
    end

    Owner->>UI: Add comment
    UI->>SA: addNoteComment(noteId, body)
    SA->>FS: Verify owner and create noteComments document
    FS-->>UI: Live snapshot: comment appears
    UI-->>Owner: Toast, form cleared
```

---

## 3. State coverage checklist

| Surface                      | Loading                                                             | Empty                                                     | Error                                               | Success                                                    |
| ---------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Share dialog — collaborators | Spinner/skeleton; actions disabled                                  | “No one else has access yet”, email input still available | “Couldn’t load collaborators” + Retry               | Collaborator rows with remove actions                      |
| Share dialog — review status | Inherits collaborator loading state                                 | —                                                         | Inherits collaborator error state                   | “Reviewed {date}” or “Not reviewed yet” per collaborator   |
| Share submit                 | Button spinner, input disabled                                      | —                                                         | Inline/toast error; keep email so it can be retried | Toast “Shared with X”; input cleared; collaborator appears |
| Remove collaborator          | Row spinner, remove button disabled                                 | —                                                         | Toast “Couldn’t remove access”; row remains         | Toast “Access removed”; row disappears                     |
| Shared with me               | Skeleton/spinner                                                    | “Notes shared with you will appear here”                  | “Couldn’t load shared notes” + Retry                | Read-only note cards with review tick                      |
| Shared note view             | Renders from the list; show spinner only if opened via a direct URL | —                                                         | Direct-URL fetch failure: error + Back/Retry        | Title, body, owner name; no edit/delete controls           |
| Recipient review             | Tick button spinner, disabled                                       | —                                                         | Toast “Couldn’t update review status”; tick unchanged | Tick turns green; owner’s collaborator list updates live  |
| Comments list                | “Loading comments…” spinner                                          | “No comments yet. Start the conversation.”                | “Couldn’t load comments” + Retry                    | Chronological comments with author and timestamp           |
| Add comment                  | Button “Posting…”, textarea disabled                                | Empty submit shows “Comment cannot be empty”              | Inline + toast error; keep text so it can be retried | Toast “Comment added”; form cleared; comment appears live  |

---

## Key transitions

- **Share succeeds**: the transaction updates `notes.sharedWithUids` and creates/updates the
  `noteShares` document. The recipient’s live `array-contains` query picks up the note without a
  refresh.
- **Revoke succeeds**: `sharedWithUids` loses the UID and the share document gets `revokedAt` set.
  The recipient’s list updates live and security rules deny further access.
- **Owner soft-deletes**: shares are cleared/revoked in the same server operation, so recipients
  immediately lose access.
- **Review toggled**: `setNoteReviewed` verifies the active note, the recipient’s presence in
  `sharedWithUids`, and the active share record before setting or clearing `reviewedAt`. The
  owner’s live collaborator query picks up the change without a refresh.
- **Note re-shared**: `shareNote` upserts the share with `reviewedAt: null`, so a recipient who
  previously reviewed a revoked note must review it again after access is restored.
- **Comment added**: `addNoteComment` verifies the caller is the owner or an active recipient,
  then appends a `noteComments` document. Both the owner and recipient comment lists update live.
- **Comment reads follow the parent note**: rules allow a comment read only when the note exists,
  is not soft-deleted, and the caller is the owner or in `sharedWithUids`. Revoked recipients lose
  access to the whole comment thread immediately.
- **Session expires**: `requireAuth()` redirects to sign-in; the UI should treat this as a
  terminal error rather than an inline retry.
- **All share, review, and comment writes go through Server Actions**: client writes to
  `noteShares` and `noteComments` are denied by rules, so the UI cannot bypass participant checks.

---

## Data touched

| Collection                           | Access             | Purpose                                                                       |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| `notes/{noteId}`                     | Read + update      | Existing note; `sharedWithUids` is the queryable access list.                 |
| `noteShares/{noteId}_{recipientUid}` | Read + server write | Collaborator metadata, owner display name, `revokedAt`, and `reviewedAt`.      |
| `noteComments/{commentId}`           | Read + server write | Append-only comments; rules derive read access from the parent note.          |
| `users/{uid}`                        | Read               | Optional display-name lookup server-side; Auth resolves the recipient.        |

---

## Implementation checklist

- [x] Add `sharedWithUids?: string[]` and `NoteShare` to the Firestore types and schema docs.
- [x] Add `shareNote`, `unshareNote`, and share cleanup in `deleteNote` as Server Actions.
- [x] Update Firestore rules for owner-or-shared note reads and owner/recipient share reads.
- [x] Add composite indexes for the active-share live queries.
- [x] Build the share dialog with loading, empty, error, and success states.
- [x] Add the "Shared with me" tab and read-only shared note view.
- [x] Add `reviewedAt` to `noteShares` and the `setNoteReviewed` Server Action.
- [x] Show review status in the owner’s collaborator list and add recipient review ticks.
- [x] Add the `noteComments` type, collection helper, rules, and composite index.
- [x] Add the `addNoteComment` Server Action with owner/active-recipient checks.
- [x] Build the reusable comments component and owner comments dialog with loading, empty,
      error, and success states.
- [x] Add action and component tests covering the error paths above.
- [ ] Add Firestore rules unit tests (requires an emulator test harness).
- [x] Verify the two-account demo, including live share and revoke updates.

---

## 4. Architecture diagram

```mermaid
flowchart TB
    classDef ui fill:#e0e7ff,stroke:#3730a3,color:#1e1b4b
    classDef server fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef data fill:#dcfce7,stroke:#166534,color:#14532d
    classDef auth fill:#fce7f3,stroke:#9d174d,color:#831843
    classDef rules fill:#fef2f2,stroke:#991b1b,color:#7f1d1d
    classDef live fill:#ede9fe,stroke:#5b21b6,color:#4c1d95

    subgraph FRONTEND[Frontend - Next.js App Router]
        direction TB
        UI1["Share Dialog (Owner)"]:::ui
        UI2["Shared with Me Tab (Recipient)"]:::ui
        UI3["Read-only Note View (Recipient)\nreview tick + comments"]:::ui
        UI4["Notes List / My Notes (Owner)"]:::ui
        UI5["Comments Dialog (Owner)"]:::ui
    end

    subgraph BACKEND[Server Actions - Admin SDK]
        direction TB
        SA1["shareNote(noteId, email)"]:::server
        SA2["unshareNote(noteId, recipientUid)"]:::server
        SA3["deleteNote(noteId) + cleanup shares"]:::server
        SA4["setNoteReviewed(noteId, reviewed)"]:::server
        SA5["addNoteComment(noteId, body)"]:::server
    end

    subgraph FIREBASE_AUTH[Firebase Auth Admin]
        direction TB
        AUTH["getUserByEmail(email) → recipientUid + displayName"]:::auth
    end

    subgraph FIRESTORE[Firestore - Collections & Rules]
        direction TB
        DB1[("notes/{noteId}\nownerUid, sharedWithUids[],\nupdatedAt, deletedAt")]:::data
        DB2[("noteShares/{noteId}_{uid}\nownerUid, recipientUid,\nrecipientEmail, ownerDisplayName,\ncreatedAt, updatedAt, revokedAt, reviewedAt")]:::data
        DB3[("users/{uid}\ndisplayName, email")]:::data
        DB4[("noteComments/{commentId}\nnoteId, authorUid, authorDisplayName,\nbody, createdAt, updatedAt")]:::data

        RULE1["Security Rules:\n• notes: read if ownerUid==uid OR uid in sharedWithUids\n• noteShares: read if ownerUid==uid OR recipientUid==uid, write denied\n• noteComments: read if parent note active and caller is owner/recipient, write denied\n• users: read own only"]:::rules
    end

    subgraph LIVE[Live Updates - onSnapshot]
        direction TB
        SUB1["Owner: noteShares where ownerUid==me"]:::live
        SUB2["Recipient: notes where\nsharedWithUids array-contains uid"]:::live
        SUB3["Owner + Recipient: noteComments\nwhere noteId==note, ordered by createdAt"]:::live
    end

    %% Owner flows
    UI1 -->|1. Open dialog| SUB1
    SUB1 -.->|live collaborator list| UI1

    UI1 -->|2. Enter email, click Share| SA1
    SA1 -->|validate email format| SA1
    SA1 -->|requireAuth, read note| DB1
    SA1 -->|getUserByEmail| AUTH
    AUTH -->|recipientUid + displayName| SA1
    SA1 -->|Transaction: add recipient to sharedWithUids + upsert noteShare| DB1
    SA1 -->|Transaction: create/update noteShare| DB2
    SA1 -.->|success| UI1

    %% Recipient live update on share
    DB1 -.->|onSnapshot: new note in sharedWithUids| SUB2
    SUB2 -.->|live shared note appears| UI2

    %% Manage access
    UI1 -->|3. Remove collaborator| SA2
    SA2 -->|requireAuth, verify owner| DB1
    SA2 -->|remove recipient from sharedWithUids + set revokedAt on noteShare| DB1
    SA2 -->|update noteShare revokedAt| DB2
    SA2 -.->|success| UI1

    %% Recipient live update on revoke
    DB1 -.->|onSnapshot: note removed from sharedWithUids| SUB2
    SUB2 -.->|live shared note disappears| UI2

    %% Recipient view
    UI2 -->|4. Open tab| SUB2
    SUB2 -.->|live note list| UI2
    UI2 -->|5. Click note| UI3
    UI3 -->|read note by ID| DB1
    DB1 -->|note data| UI3

    %% Review tick
    UI3 -->|6. Toggle review| SA4
    SA4 -->|requireAuth, verify active note| DB1
    SA4 -->|verify active share, set/clear reviewedAt| DB2
    SA4 -.->|success| UI3
    DB2 -.->|onSnapshot: review status| SUB1
    SUB1 -.->|live Reviewed / Not reviewed yet| UI1

    %% Comments
    UI3 -->|7. Add comment| SA5
    UI5 -->|8. Add comment| SA5
    SA5 -->|requireAuth, verify owner or recipient| DB1
    SA5 -->|verify active share for recipients| DB2
    SA5 -->|create noteComment| DB4
    SA5 -.->|success| UI3
    SA5 -.->|success| UI5
    DB4 -.->|onSnapshot| SUB3
    SUB3 -.->|live comments| UI3
    SUB3 -.->|live comments| UI5

    %% Soft delete with cleanup
    UI4 -->|9. Delete note| SA3
    SA3 -->|requireAuth, verify owner| DB1
    SA3 -->|set deletedAt, clear sharedWithUids| DB1
    SA3 -->|set revokedAt on all active noteShares| DB2
    SA3 -.->|success| UI4

    %% Rules enforcement on all reads/writes
    DB1 -.->|reads/writes checked against| RULE1
    DB2 -.->|reads/writes checked against| RULE1
    DB3 -.->|reads checked against| RULE1
    DB4 -.->|reads checked against| RULE1

    %% Styling
    style FRONTEND fill:#f5f3ff,stroke:#7c3aed
    style BACKEND fill:#fffbeb,stroke:#d97706
    style FIREBASE_AUTH fill:#fdf2f8,stroke:#db2777
    style FIRESTORE fill:#f0fdf4,stroke:#22c55e
    style LIVE fill:#faf5ff,stroke:#a855f7
```

**Data flow summary:**

| Flow              | Path                                                              | Collections touched                                                                 | Auth/Rules                                            |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Share             | Owner UI → `shareNote` → `getUserByEmail` → Firestore transaction | `notes` (update `sharedWithUids`), `noteShares` (upsert)                            | Admin SDK bypasses rules; ownership checked in action |
| Revoke            | Owner UI → `unshareNote` → Firestore writes                       | `notes` (remove from `sharedWithUids`), `noteShares` (set `revokedAt`)              | Admin SDK; ownership checked in action                |
| Recipient list    | `onSnapshot` on `notes` where `sharedWithUids` array-contains uid | `notes` (read)                                                                      | Rules: `uid in sharedWithUids`                        |
| Collaborator list | `onSnapshot` on `noteShares` where `ownerUid == me`               | `noteShares` (read)                                                                 | Rules: `ownerUid == uid`                              |
| Read shared note  | Recipient UI → direct read `notes/{noteId}`                       | `notes` (read)                                                                      | Rules: `uid in sharedWithUids`                        |
| Review toggle     | Recipient UI → `setNoteReviewed` → Firestore write                | `noteShares` (set/clear `reviewedAt`)                                               | Admin SDK; active share and note verified in action   |
| Add comment       | Owner/Recipient UI → `addNoteComment` → Firestore write           | `noteComments` (create), `noteShares` read for recipient check                      | Admin SDK; owner or active recipient verified in action |
| Comments list     | `onSnapshot` on `noteComments` where `noteId`                     | `noteComments` (read)                                                               | Rules: parent note active and caller is owner/recipient |
| Soft delete       | Owner UI → `deleteNote` → cleanup                                 | `notes` (set `deletedAt`, clear `sharedWithUids`), `noteShares` (set `revokedAt`)   | Admin SDK; ownership checked                          |

**Key invariants enforced by rules:**

- `noteShares` is **write-denied for clients** — only Server Actions (Admin SDK) can create/update.
- `sharedWithUids` on a note is **only modified by Server Actions** — clients cannot tamper with the access list.
- Recipients can **only read** notes they own or are shared with; no write/delete.
- `revokedAt` on a share document is the source of truth for revocation; rules deny reads where `revokedAt != null`.
- `noteComments` is **write-denied for clients** — only `addNoteComment` Server Action can create.
- Comment reads follow the parent note: the note must exist, be active, and the caller must be the owner or in `sharedWithUids`.
