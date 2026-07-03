# Telegram Workflow Requirements Coverage

This document compares the updated requirements with the supplied Telegram workflow and the current application implementation.

## Coverage Summary

| Area | Requirement | Current coverage | Where it is implemented | Required documentation or product change |
| --- | --- | --- | --- | --- |
| Home screen | Add New Profile/Number with profile name, avatar/image, and config numbers. | Partial. The app connects a Telegram number first, then profile metadata is edited separately. | `public/index.html` Add Number and Profiles views; `public/app.js` login flow, profile form, and `state.profiles`; `src/server.ts` `/v1/telegram/login/*` routes. | Document the flow as: connect number, then complete profile name, avatar, and config numbers in Profile Management. |
| Home screen | Manage numbers, edit profile name/avatar/config numbers, and delete number. | Covered. | `public/index.html` Manage Numbers and Profiles views; `public/app.js` `renderAccounts`, `profileForm`, and `deleteAccount`; `src/server.ts` `GET /v1/telegram/accounts` and `DELETE /v1/telegram/accounts/<accountId>`. | No major documentation change needed, except clarifying that profile edit fields live in Profile Management. |
| Contact Management | View all contacts associated with the selected profile. | Partial. Contacts are stored as workspace records, but they are not currently scoped to a selected profile/account. | `public/index.html` Contacts view; `public/app.js` `state.contacts`, `renderContacts`, contact save/edit/delete handlers, contact JSON import/export. | Add requirement that each contact record must include a `profileId` or `accountId`, and Contact Management must filter by selected profile. |
| Contact Management | Add, edit, and delete contacts. | Covered for local workspace contacts. | `public/index.html` contact form/list; `public/app.js` contact form submit, `data-edit-contact`, and `data-delete-contact` handlers. | Document that contacts are maintained in JSON workspace storage unless later synced from Telegram. |
| Group Management | View all groups associated with the selected profile. | Partial. Groups are stored as workspace records, but they are not currently scoped to a selected profile/account. | `public/index.html` Groups view; `public/app.js` `state.groups`, `renderGroups`, group save/edit/delete handlers. | Add requirement that each group record must include a `profileId` or `accountId`, and Group Management must filter by selected profile. |
| Group Management | Create, edit, and delete groups. | Covered for local workspace groups. | `public/index.html` group form/list; `public/app.js` group form submit, `data-edit-group`, and `data-delete-group` handlers. | Document that group records are maintained in JSON workspace storage. |
| Post Management | Create and save a post. | Covered. | `public/index.html` Post Manager view; `public/app.js` `postFromForm`, `savePost`, and `state.posts`. | No major documentation change needed. |
| Post Management | Save the post successfully before sending. | Partial. The current `Post now` action can send current form content and then save it as Posted. | `public/app.js` `post-send-now` click handler and `savePost("Posted")`. | Add requirement that sending must be disabled until the saved post exists and the latest edits have been saved. |
| Post Management | Preview the saved post before sending. | Partial. Live preview exists, but there is no enforced preview step after save. | `public/index.html` Post Preview panel; `public/app.js` `renderPostPreview`. | Add requirement that the preview uses the saved JSON post and must be confirmed before sending. |
| Post Management | Send saved posts to individual contacts. | Covered for saved workspace contacts. | `public/index.html` `post-contact-targets`; `public/app.js` `renderPostContacts`, `postTargets`, `sendPostToTargets`; `src/server.ts` `POST /v1/messages`. | Document that usernames are preferred and phone-number delivery can be blocked by Telegram privacy. |
| Post Management | Send saved posts to groups. | Covered for saved workspace groups as broadcast lists. | `public/index.html` `post-group-targets`; `public/app.js` `renderPostGroups`, `groupRecipients`, `postTargets`, `sendPostToTargets`; `src/server.ts` `POST /v1/messages`. | Document that saved groups send to listed members one by one; Telegram private group chat sync is still separate future work. |
| Post lists | Show post lists with tags by date and category, including text, image plus text, and videos. | Covered, with additional post types. | `public/index.html` post type/category/tag fields and list filters; `public/app.js` `postLabels`, `renderPosts`, `renderPostPreview`. | No major documentation change needed. |
| Manual and scheduled posting | Select a profile, manual posting actions, and scheduled posting actions. | Covered in the browser workspace. Scheduled posts auto-send while the browser is open and signed in. | `public/index.html` global profile selector and Post Manager status/scheduled date; `public/app.js` `selectAccount`, `post-schedule`, `runScheduler`, `sendScheduledPost`. | Document that a server-side scheduler worker is still required if scheduled sending must run while the browser is closed. |
| Post Sending History | Separate tab for sent posts and pending/not yet sent posts. | Covered. The sidebar includes a Post History view with Sent Posts and Pending / Not Yet Sent Posts sections. | `public/index.html` `view-post-history`; `public/app.js` `renderPostHistory`, `state.postHistory`, `savePostHistory`; backend history remains available through `src/server.ts` `GET /v1/messages`. | No major documentation change needed. |
| Post Sending History | For sent posts, maintain date/time, recipient phone numbers, group names, and delivery status. | Covered for browser workspace post sends. Each send attempt records date/time, recipient, contact/group name, delivery status, Telegram message id, and error text when failed. Backend message history also stores successful Telegram sends. | Browser JSON history: `public/app.js` `state.postHistory`, `savePostHistory`, `renderPostHistory`; backend history: `src/store.ts` `MessageRecord`, `recordMessage`, `listMessages`; `src/server.ts` `POST /v1/messages` and `GET /v1/messages`. | Document that browser Post History starts recording from this implementation forward; older backend sends remain in database history only. |
| QR Code | Post Manager should include a dedicated QR Code tab. | Missing. | No current `view-qr` or Post Manager QR subtab exists. | Add a QR Code tab under Post Manager and define JSON data for generated/imported QR codes. |
| JSON support | All post, contact, group, and sending history details should be maintained in JSON format. | Covered for profiles, contacts, groups, posts, and post sharing history in browser localStorage/backup JSON. QR Code JSON is still pending with the QR tab. Backend message history is stored encrypted in PostgreSQL and returned as JSON through the API. | `public/app.js` `read`, `write`, `backupData`, contact import/export, `state.postHistory`; `src/server.ts` JSON API responses. | Add QR Code JSON schema when the QR tab is implemented. |

## Updated Flow Additions

The supplied workflow should be updated with these requirements.

### Select a Profile

Contact Management must include:

- View contacts for the selected profile Telegram account.
- Add a contact for the selected profile.
- Edit a contact for the selected profile.
- Delete a contact from the selected profile.
- Import and export contacts as JSON.

Group Management must include:

- View groups for the selected profile Telegram account.
- Create a group record for the selected profile.
- Edit a group record for the selected profile.
- Delete a group record from the selected profile.
- Maintain group members/settings as JSON.

### Posting Manager

Saving Posts must include:

- Create a post storage folder or JSON-backed storage area for saved posts.
- Save every post before it can be previewed or sent.
- Preview the saved JSON post before sending.
- Keep post lists searchable/filterable by date, category, tag, type, and status.
- Support text-only, image plus text, and video post types at minimum.
- Keep manual posting and scheduled posting actions under the selected profile.

Sending Posts must include:

- Show contacts as a selectable list, not a dropdown.
- Show groups as a selectable list, not a dropdown.
- Allow one or more contacts and/or groups to be selected before sending.
- Send only after the post has been saved and previewed.

Post Manager must also include:

- A Post History tab.
- A QR Code tab.

### Post History

The Post History tab must show:

- Sent Posts.
- Pending/Not Yet Sent Posts.

Every sent-post history record must maintain JSON fields for:

- Post ID and profile/account ID.
- Date and time.
- Recipient phone number or username.
- Group name when the recipient is a group.
- Delivery status such as `pending`, `sent`, `failed`, or `cancelled`.
- Telegram message ID when available.
- Error message when delivery fails.

### JSON Data Requirements

All workflow records should have stable JSON structures:

- `contacts.json`: selected profile/account ID, name, username, phone, contact group, notes, created/updated timestamps.
- `groups.json`: selected profile/account ID, group name, type, status, members, settings/notes, created/updated timestamps.
- `posts.json`: title, type, category, tags, media URL, body/caption, status, schedule date, selected recipients, created/updated timestamps.
- `post-history.json`: post ID, profile/account ID, sent date/time, recipients, groups, delivery status, Telegram message IDs, errors.
- `qr-codes.json`: post ID or campaign ID, QR payload, generated image/reference, created/updated timestamps.

The current implementation keeps workspace metadata as browser localStorage JSON and exposes a backup JSON export. A later backend phase should decide whether these JSON records are persisted as files, database JSON columns, or both.
