# Data model

The existing schema is preserved as-is. `User` owns `Bot` and `Submission`. `Bot` stores `sourceCode`, `language`, active/public flags, and ownership. `Submission` stores the tested source, language, status, JSON result, and optional bot association. `Match` and `MatchParticipant` persist direct games. `Room`, `RoomPlayer`, and `RoomPresence` support scheduled rooms and viewers. `FriendRequest`, `UserPresence`, and `SocialInvitation` support social flows.

The language extension requires no schema migration: `Bot.language` and `Submission.language` are existing strings, with application validation restricting values to `javascript`, `cpp`, and `python`.
