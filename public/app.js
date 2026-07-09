const keys = {
  selected: "telegramWorkflow:selectedAccount",
  inboxView: "telegramWorkflow:inboxView",
  profiles: "telegramWorkflow:profiles",
  contacts: "telegramWorkflow:contacts",
  groups: "telegramWorkflow:groups",
  channels: "telegramWorkflow:channels",
  posts: "telegramWorkflow:posts",
  postHistory: "telegramWorkflow:postHistory",
  settings: "telegramWorkflow:settings"
};

const titles = {
  dashboard: ["Home", "Dashboard"],
  "add-number": ["Numbers", "Add Number"],
  "manage-numbers": ["Numbers", "Manage Numbers"],
  profiles: ["Profiles", "Profile Management"],
  applications: ["Applications", "Workflow Applications"],
  contacts: ["Contacts", "Contact Management"],
  inbox: ["Messages", "Message"],
  groups: ["Groups", "Group Management"],
  channels: ["Channels", "Channel Management"],
  posts: ["Posting", "Posting Manager"],
  "post-history": ["Posting", "Post History"],
  search: ["Search", "Workspace Search"],
  configuration: ["Settings", "Configuration"],
  backup: ["Backup", "Backup and Restore"]
};

const postLabels = { text: "Text only", image: "Image + text", video: "Video + text", document: "Document", audio: "Audio", voice: "Voice", poll: "Poll", quiz: "Quiz", forwarded: "Forwarded" };
const inboxViewLabels = { split: "Split", compact: "Compact", focus: "Focus", multi: "Multi" };
const apps = ["Telegram Workflow", "WhatsApp Workflow", "Discord Workflow", "Slack Workflow"];
const contactCountries = Array.from(document.querySelectorAll("#phone-country-code option"))
  .map((option) => ({ code: option.value, label: option.textContent.trim() }))
  .filter((country) => country.code && country.label);
const contactCountryCodes = [...new Set(contactCountries.map((country) => country.code))];
const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const uid = (prefix) => `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

function populateContactCountrySelect(select) {
  select.innerHTML = "";
  contactCountries.forEach((country) => select.add(new Option(country.label, country.code)));
  select.value = "+91";
}

function ensureCountryCodeField(phoneInputId, selectId) {
  const phoneInput = $(phoneInputId);
  if (!phoneInput) return;
  let select = $(selectId);
  if (!select) {
    select = document.createElement("select");
    select.id = selectId;
    select.name = "countryCode";
    select.setAttribute("aria-label", "Country code");
    select.setAttribute("autocomplete", "tel-country-code");
    const row = document.createElement("div");
    row.className = "phone-input-row";
    phoneInput.parentNode.insertBefore(row, phoneInput);
    row.append(select, phoneInput);
  }
  populateContactCountrySelect(select);
}

function ensureContactCountryCodeField() {
  ensureCountryCodeField("contact-phone", "contact-country-code");
}

function ensureLoginCountryCodeField() {
  ensureCountryCodeField("phone", "phone-country-code");
}

ensureLoginCountryCodeField();
ensureContactCountryCodeField();

const state = {
  user: null,
  accounts: [],
  selected: localStorage.getItem(keys.selected) || "",
  login: { challengeId: "", stage: "phone" },
  profiles: read(keys.profiles, {}),
  contacts: read(keys.contacts, []),
  groups: read(keys.groups, []),
  channels: read(keys.channels, []),
  posts: read(keys.posts, []),
  postHistory: read(keys.postHistory, []),
  settings: read(keys.settings, { api: "Server API", telegram: "Default Telegram workflow", session: "Browser session", proxy: "", storage: "Browser local workspace", theme: "Dark mode" }),
  activeView: "dashboard",
  inbox: { messages: [], selectedThread: "", loading: false, lastSyncAt: 0, view: localStorage.getItem(keys.inboxView) || "split", drafts: {} },
  scheduledSending: new Set()
};

const el = {
  signInView: $("sign-in-view"), workspace: $("workspace"), identity: $("identity"), userName: $("user-name"), signOut: $("sign-out"),
  passwordSignInForm: $("password-sign-in-form"), tokenSignInForm: $("token-sign-in-form"), username: $("username"), loginPassword: $("login-password"), accessToken: $("access-token"), signInStatus: $("sign-in-status"),
  viewKicker: $("view-kicker"), viewTitle: $("view-title"), profileSelect: $("global-profile-select"), refreshAccounts: $("refresh-accounts"),
  phoneForm: $("phone-form"), phone: $("phone"), phoneCountryCode: $("phone-country-code"), codeForm: $("code-form"), code: $("code"), passwordForm: $("password-form"), telegramPassword: $("telegram-password"), connectStep: $("connect-step"), connectCopy: $("connect-copy"), connectStatus: $("connect-status"),
  accountList: $("account-list"), numberSearch: $("number-search"), numberStatusFilter: $("number-status-filter"), selectedProfileCard: $("selected-profile-card"),
  metricAccounts: $("metric-accounts"), metricContacts: $("metric-contacts"), metricGroups: $("metric-groups"), metricPosts: $("metric-posts"),
  quickSendForm: $("quick-send-form"), quickRecipient: $("quick-recipient"), quickMessage: $("quick-message"), quickSendButton: $("quick-send-button"), messageStatus: $("message-status"),
  profileForm: $("profile-form"), profileList: $("profile-list"), profileStatusMessage: $("profile-status-message"), applicationList: $("application-list"),
  contactForm: $("contact-form"), contactCountryCode: $("contact-country-code"), contactList: $("contact-list"), contactStatus: $("contact-status"), contactSearch: $("contact-search"), contactImportJson: $("contact-import-json"),
  inboxSearch: $("inbox-search"), inboxShell: $("inbox-shell"), inboxViewButtons: $$(".inbox-view-control button[data-inbox-view]"), inboxThreadList: $("inbox-thread-list"), inboxActiveHeading: $("inbox-active-heading"), inboxThread: $("inbox-thread"), inboxMultiBoard: $("inbox-multi-board"), inboxForm: $("inbox-form"), inboxMessage: $("inbox-message"), inboxSendButton: $("inbox-send-button"), inboxRefresh: $("inbox-refresh"), inboxStatus: $("inbox-status"),
  groupForm: $("group-form"), groupList: $("group-list"), channelForm: $("channel-form"), channelList: $("channel-list"),
  postForm: $("post-form"), postPreview: $("post-preview"), postList: $("post-list"), postContactTargets: $("post-contact-targets"), postGroupTargets: $("post-group-targets"), postStatusMessage: $("post-status-message"), postSearch: $("post-search"), postFilterType: $("post-filter-type"), postSort: $("post-sort"),
  postHistorySent: $("post-history-sent"), postHistoryPending: $("post-history-pending"),
  globalSearch: $("global-search"), globalResults: $("global-results"), settingsForm: $("settings-form"), settingsStatus: $("settings-status"), backupJson: $("backup-json"), backupStatus: $("backup-status")
};

class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
async function api(path, options = {}) {
  const response = await fetch(path, { method: options.method || "GET", credentials: "same-origin", headers: options.body ? { "content-type": "application/json" } : {}, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || "The request could not be completed.", response.status);
  return data;
}

function status(node, message = "", tone = "") { node.textContent = message; tone ? node.dataset.tone = tone : delete node.dataset.tone; }
function busy(form, isBusy) { const button = form.querySelector("button[type='submit']"); if (button) button.disabled = isBusy; }
function onError(error, node) { if (error instanceof ApiError && error.status === 401) return signedOut("Your session has ended. Please sign in again."); status(node, error instanceof Error ? error.message : "Something went wrong.", "error"); }
function signedOut(message = "") { state.user = null; state.accounts = []; el.workspace.hidden = true; el.identity.hidden = true; el.signInView.hidden = false; resetLogin(); status(el.signInStatus, message, message ? "error" : ""); }
function signedIn(user) { state.user = user; el.signInView.hidden = true; el.workspace.hidden = false; el.identity.hidden = false; el.userName.textContent = user.displayName; applyTheme(); }function accountLabel(account) { return account.username ? `@${account.username}` : `Telegram ${account.telegramUserId || "account"}`; }
function currentAccount() { return state.accounts.find((account) => account.id === state.selected) || null; }
function profileFor(account) {
  if (!account) return null;
  state.profiles[account.id] ||= { profileName: account.displayName || "Telegram profile", displayName: account.displayName || "", username: account.username || "", phone: "", status: "Active", avatar: "", configNumbers: "", description: "" };
  return state.profiles[account.id];
}
function initials(value) {
  const parts = String(value || "T").trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] || "T"}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`;
  return letters.toUpperCase().slice(0, 2);
}
function avatar(profile, fallback) { return profile?.avatar ? `<span class="account-avatar"><img src="${esc(profile.avatar)}" alt=""></span>` : `<span class="account-avatar">${esc(initials(fallback))}</span>`; }
function chatAvatar(label, extraClass = "") { return `<span class="chat-avatar${extraClass ? ` ${extraClass}` : ""}" aria-hidden="true">${esc(initials(label))}</span>`; }
function saveAll() { write(keys.profiles, state.profiles); write(keys.contacts, state.contacts); write(keys.groups, state.groups); write(keys.channels, state.channels); write(keys.posts, state.posts); write(keys.postHistory, state.postHistory); write(keys.settings, state.settings); }
function selectAccount(id) { state.selected = id || ""; state.selected ? localStorage.setItem(keys.selected, state.selected) : localStorage.removeItem(keys.selected); state.inbox.messages = []; state.inbox.selectedThread = ""; state.inbox.lastSyncAt = 0; state.inbox.drafts = {}; render(); if (state.activeView === "inbox") void loadInboxMessages({ quiet: true }); }
function ensureSelected() { if (!state.accounts.some((account) => account.id === state.selected)) state.selected = state.accounts[0]?.id || ""; }

function renderProfileSelect() {
  ensureSelected();
  el.profileSelect.innerHTML = "";
  if (!state.accounts.length) {
    el.profileSelect.innerHTML = '<option value="">Connect a number first</option>';
    el.profileSelect.disabled = true;
    el.quickSendButton.disabled = true;
    return;
  }
  for (const account of state.accounts) {
    const profile = profileFor(account);
    el.profileSelect.add(new Option(`${profile.profileName} - ${accountLabel(account)}`, account.id));
  }
  el.profileSelect.value = state.selected;
  el.profileSelect.disabled = false;
  el.quickSendButton.disabled = false;
  write(keys.profiles, state.profiles);
}

function renderDashboard() {
  el.metricAccounts.textContent = state.accounts.length;
  el.metricContacts.textContent = state.contacts.length;
  el.metricGroups.textContent = state.groups.length;
  el.metricPosts.textContent = state.posts.length;
  const account = currentAccount();
  if (!account) { el.selectedProfileCard.innerHTML = '<p class="empty">No Telegram number is connected yet.</p>'; return; }
  const profile = profileFor(account);
  el.selectedProfileCard.innerHTML = `<div class="account-item unframed">${avatar(profile, profile.profileName)}<div class="account-meta"><div class="account-name">${esc(profile.profileName)}</div><div class="account-handle">${esc([accountLabel(account), profile.status, profile.phone].filter(Boolean).join(" | "))}</div></div></div><p class="muted">${esc(profile.description || "Profile ready for contact, group, channel, and posting workflows.")}</p>`;
}

function renderAccounts() {
  const query = el.numberSearch.value.trim().toLowerCase();
  const statusFilter = el.numberStatusFilter.value;
  const accounts = state.accounts.filter((account) => {
    const profile = profileFor(account);
    const text = [profile.profileName, profile.displayName, profile.username, profile.phone, profile.configNumbers, account.displayName, account.username].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (!statusFilter || profile.status === statusFilter);
  });
  el.accountList.innerHTML = accounts.length ? accounts.map((account) => {
    const profile = profileFor(account);
    return `<article class="account-item ${account.id === state.selected ? "selected" : ""}">${avatar(profile, profile.profileName)}<div class="account-meta"><div class="account-name">${esc(profile.profileName)}</div><div class="account-handle">${esc([profile.displayName || account.displayName, accountLabel(account), profile.status].filter(Boolean).join(" | "))}</div></div><div class="account-actions"><button class="mini-button" data-select-account="${esc(account.id)}" type="button">Use</button><button class="mini-button" data-edit-account="${esc(account.id)}" type="button">Edit</button><button class="mini-button" data-delete-account="${esc(account.id)}" type="button">Delete</button></div></article>`;
  }).join("") : `<p class="empty">${state.accounts.length ? "No profiles match this filter." : "No Telegram accounts connected yet."}</p>`;
}

function renderProfileForm() {
  const account = currentAccount();
  const fields = Array.from(el.profileForm.elements);
  fields.forEach((field) => field.disabled = !account);
  if (!account) { el.profileForm.reset(); return; }
  const profile = profileFor(account);
  $("profile-name").value = profile.profileName || "";
  $("profile-display-name").value = profile.displayName || account.displayName || "";
  $("profile-username").value = profile.username || account.username || "";
  $("profile-phone").value = profile.phone || "";
  $("profile-status").value = profile.status || "Active";
  $("profile-avatar").value = profile.avatar || "";
  $("profile-config-numbers").value = profile.configNumbers || "";
  $("profile-description").value = profile.description || "";
}

function renderProfileList() {
  el.profileList.innerHTML = state.accounts.length ? state.accounts.map((account) => {
    const profile = profileFor(account);
    return `<article class="account-item ${account.id === state.selected ? "selected" : ""}">${avatar(profile, profile.profileName)}<div class="account-meta"><div class="account-name">${esc(profile.profileName)}</div><div class="account-handle">${esc([accountLabel(account), profile.status].filter(Boolean).join(" | "))}</div></div><button class="mini-button" data-select-account="${esc(account.id)}" type="button">Select</button></article>`;
  }).join("") : '<p class="empty">Add a number to create a profile.</p>';
}

function renderApplications() {
  el.applicationList.innerHTML = apps.map((name, index) => `<article class="application-card"><span class="badge ${index === 0 ? "success" : ""}">${index === 0 ? "Available" : "Later"}</span><h3>${esc(name)}</h3><p class="muted">${index === 0 ? "Contacts, groups, channels, posts, and sending" : "Reserved for the same workflow shell"}</p></article>`).join("");
}

function splitContactPhone(value) {
  const text = String(value || "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return { countryCode: "+91", localPhone: "" };
  const normalized = text.startsWith("+") ? `+${digits}` : digits;
  const countryCode = contactCountryCodes.slice().sort((a, b) => b.length - a.length).find((code) => normalized.startsWith(code) && normalized.length > code.length) || "+91";
  const localPhone = normalized.startsWith(countryCode) ? normalized.slice(countryCode.length) : digits;
  return { countryCode, localPhone };
}

function normalizeContactPhone(rawPhone, countryCode = "+91") {
  const text = String(rawPhone || "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  if (text.startsWith("+")) return `+${digits}`;
  const code = contactCountryCodes.includes(countryCode) ? countryCode : "+91";
  const countryDigits = code.replace(/\D/g, "");
  return digits.startsWith(countryDigits) && digits.length > countryDigits.length + 6 ? `+${digits}` : `${code}${digits}`;
}

function loginPhoneFromForm() {
  return normalizeContactPhone(el.phone.value, el.phoneCountryCode?.value || "+91");
}

function contactPhoneFromForm() {
  return normalizeContactPhone($("contact-phone").value, el.contactCountryCode.value);
}

function clearContactForm() {
  el.contactForm.reset();
  $("contact-id").value = "";
  el.contactCountryCode.value = "+91";
}

function fillContactForm(item) {
  const phone = splitContactPhone(item.phone);
  $("contact-id").value = item.id;
  $("contact-name").value = item.name || "";
  $("contact-handle").value = item.handle || "";
  el.contactCountryCode.value = item.countryCode || phone.countryCode;
  $("contact-phone").value = phone.localPhone;
  $("contact-group").value = item.group || "";
  $("contact-notes").value = item.notes || "";
}

function contactPhoneDisplay(contact) {
  const rawPhone = String(contact?.phone || "").trim();
  return rawPhone ? normalizeContactPhone(rawPhone, contact.countryCode || splitContactPhone(rawPhone).countryCode) || rawPhone : "";
}

function record(title, meta, body, actions) {
  return `<article class="record-item"><div><h3>${esc(title || "Untitled")}</h3><p class="record-meta">${esc(meta || "No metadata")}</p>${body ? `<p class="muted">${esc(body)}</p>` : ""}</div><div class="record-actions">${actions}</div></article>`;
}
function empty(text) { return `<p class="empty">${esc(text)}</p>`; }

function renderContacts() {
  const query = el.contactSearch.value.trim().toLowerCase();
  const list = state.contacts.filter((item) => [item.name, item.handle, item.countryCode, item.phone, contactPhoneDisplay(item), item.group, item.notes].join(" ").toLowerCase().includes(query));
  el.contactList.innerHTML = list.length ? list.map((item) => record(item.name, [item.handle, contactPhoneDisplay(item), item.group].filter(Boolean).join(" | "), item.notes, `<button class="mini-button" data-edit-contact="${esc(item.id)}" type="button">Edit</button><button class="mini-button" data-delete-contact="${esc(item.id)}" type="button">Delete</button>`)).join("") : empty("No contacts found.");
}
function renderGroups() {
  el.groupList.innerHTML = state.groups.length ? state.groups.map((item) => record(item.name, [item.type, item.status, `${lines(item.members).length} members`].join(" | "), item.notes, `<button class="mini-button" data-edit-group="${esc(item.id)}" type="button">Edit</button><button class="mini-button" data-delete-group="${esc(item.id)}" type="button">Delete</button>`)).join("") : empty("No groups saved.");
}
function renderChannels() {
  el.channelList.innerHTML = state.channels.length ? state.channels.map((item) => record(item.name, [item.privacy, `${lines(item.invites).length} invites`].join(" | "), item.notes, `<button class="mini-button" data-edit-channel="${esc(item.id)}" type="button">Edit</button><button class="mini-button" data-delete-channel="${esc(item.id)}" type="button">Delete</button>`)).join("") : empty("No channels saved.");
}

function selectedPostContactIds() { return $$('input[name="post-contact-target"]:checked').map((node) => node.value); }
function selectedPostGroupIds() { return $$('input[name="post-group-target"]:checked').map((node) => node.value); }
function recipientFromGroupLine(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const username = text.match(/@[A-Za-z0-9_]{5,}/);
  if (username) return username[0];
  const phone = text.match(/\+\d[\d\s().-]{6,}\d/);
  if (phone) return phone[0].replace(/[^\d+]/g, "");
  if (/^[A-Za-z][A-Za-z0-9_]{4,}$/.test(text)) return `@${text}`;
  const digits = text.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (text.startsWith("+") && /^\d{8,15}$/.test(digits)) return `+${digits}`;
  return text;
}
function groupRecipients(group) {
  const seen = new Set();
  return lines(group?.members).map(recipientFromGroupLine).filter(Boolean).filter((recipient) => {
    const key = recipient.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function contactRecipient(contact) {
  const handle = recipientFromGroupLine(contact?.handle || "");
  if (handle) return handle;
  const rawPhone = String(contact?.phone || "").trim();
  return normalizeContactPhone(rawPhone, contact?.countryCode || "+91") || recipientFromGroupLine(rawPhone);
}
function postTargets(post) {
  const rows = [];
  const seen = new Set();
  const add = (recipient, source, firstName = "") => {
    const clean = recipientFromGroupLine(recipient);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ recipient: clean, source, firstName });
  };
  add(post.recipient, "Manual");
  (post.contacts || []).forEach((id) => {
    const contact = state.contacts.find((row) => row.id === id);
    if (!contact) return;
    add(contactRecipient(contact), contact.name || "Contact", contact.name || "Telegram Contact", "contact");
  });
  (post.groups || []).forEach((id) => {
    const group = state.groups.find((row) => row.id === id);
    if (!group) return;
    groupRecipients(group).forEach((recipient) => add(recipient, group.name || "Group", group.name || "Telegram Group", "group"));
  });
  return rows;
}
function renderPostContacts(selectedIds = selectedPostContactIds()) {
  const selected = new Set(selectedIds);
  el.postContactTargets.innerHTML = state.contacts.length ? state.contacts.map((contact) => {
    const recipient = contactRecipient(contact);
    const checked = selected.has(contact.id) ? " checked" : "";
    const disabled = recipient ? "" : " disabled";
    const detail = recipient || "Add username or phone first";
    return `<label class="recipient-option"><input type="checkbox" name="post-contact-target" value="${esc(contact.id)}"${checked}${disabled}><span><strong>${esc(contact.name || "Untitled contact")}</strong><small>${esc(detail)}</small></span></label>`;
  }).join("") : empty("No contacts saved.");
}
function renderPostGroups(selectedIds = selectedPostGroupIds()) {
  const selected = new Set(selectedIds);
  el.postGroupTargets.innerHTML = state.groups.length ? state.groups.map((group) => {
    const count = groupRecipients(group).length;
    const checked = selected.has(group.id) ? " checked" : "";
    return `<label class="recipient-option"><input type="checkbox" name="post-group-target" value="${esc(group.id)}"${checked}><span><strong>${esc(group.name || "Untitled group")}</strong><small>${esc([`${count} recipients`, group.status].filter(Boolean).join(" | "))}</small></span></label>`;
  }).join("") : empty("No groups saved.");
}
function postFromForm() {
  const existing = state.posts.find((item) => item.id === $("post-id").value);
  return { id: $("post-id").value || uid("post"), title: $("post-title").value.trim(), type: $("post-type").value, category: $("post-category").value.trim(), tags: $("post-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean), status: $("post-status").value, scheduledAt: $("post-scheduled-at").value, mediaUrl: $("post-media-url").value.trim(), body: $("post-body").value.trim(), recipient: $("post-recipient").value.trim(), contacts: selectedPostContactIds(), groups: selectedPostGroupIds(), accountId: currentAccount()?.id || existing?.accountId || "", createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}
function savePost(statusOverride = "") {
  const post = postFromForm();
  if (!post.title) { status(el.postStatusMessage, "Post title is required.", "error"); return null; }
  if (statusOverride) post.status = statusOverride;
  const index = state.posts.findIndex((item) => item.id === post.id);
  index === -1 ? state.posts.unshift(post) : state.posts[index] = post;
  $("post-id").value = post.id;
  $("post-status").value = post.status;
  write(keys.posts, state.posts);
  render();
  status(el.postStatusMessage, "Post saved.", "success");
  return post;
}
function fillPost(post) {
  $("post-id").value = post.id; $("post-title").value = post.title || ""; $("post-type").value = post.type || "text"; $("post-category").value = post.category || ""; $("post-tags").value = (post.tags || []).join(", "); $("post-status").value = post.status || "Draft"; $("post-scheduled-at").value = post.scheduledAt || ""; $("post-media-url").value = post.mediaUrl || ""; $("post-body").value = post.body || ""; $("post-recipient").value = post.recipient || ""; renderPostContacts(post.contacts || []); renderPostGroups(post.groups || []); renderPostPreview();
}
function clearPost() { el.postForm.reset(); $("post-id").value = ""; $("post-status").value = "Draft"; renderPostContacts([]); renderPostGroups([]); renderPostPreview(); }
function formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : value; }
function renderPostPreview() {
  const post = postFromForm();
  const contactNames = (post.contacts || []).map((id) => state.contacts.find((contact) => contact.id === id)?.name).filter(Boolean);
  const groupNames = (post.groups || []).map((id) => state.groups.find((group) => group.id === id)?.name).filter(Boolean);
  const tags = [postLabels[post.type], post.category, post.status, post.scheduledAt ? formatDate(post.scheduledAt) : "", ...contactNames.map((name) => `Contact: ${name}`), ...groupNames.map((name) => `Group: ${name}`)].filter(Boolean).map((tag) => `<span class="badge">${esc(tag)}</span>`).join("");
  let media = "";
  if (post.mediaUrl && post.type === "image") media = `<img src="${esc(post.mediaUrl)}" alt="">`;
  else if (post.mediaUrl && post.type === "video") media = `<video src="${esc(post.mediaUrl)}" controls></video>`;
  else if (post.mediaUrl) media = `<a href="${esc(post.mediaUrl)}" target="_blank" rel="noreferrer">${esc(post.mediaUrl)}</a>`;
  const body = (post.type === "poll" || post.type === "quiz")
    ? `<div class="poll-preview">${(lines(post.body).length ? lines(post.body) : ["Poll options will appear here."]).map((line) => `<span>${esc(line)}</span>`).join("")}</div>`
    : `<p class="preview-text">${esc(post.body || "Post text or caption will appear here.")}</p>`;
  const tagRow = post.tags.length ? `<div class="tag-row">${post.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div>` : "";
  el.postPreview.innerHTML = `<div class="tag-row">${tags}</div><h3>${esc(post.title || "Untitled post")}</h3>${media}${body}${tagRow}`;
}
function renderPosts() {
  const query = el.postSearch.value.trim().toLowerCase();
  const type = el.postFilterType.value;
  const sort = el.postSort.value;
  let posts = state.posts.filter((post) => (!type || post.type === type) && (!query || [post.title, post.type, post.category, (post.tags || []).join(" "), post.status, post.body, post.recipient].join(" ").toLowerCase().includes(query)));
  posts = posts.slice().sort((a, b) => sort === "created-asc" ? a.createdAt.localeCompare(b.createdAt) : sort === "category" ? (a.category || "").localeCompare(b.category || "") : sort === "scheduled" ? (a.scheduledAt || "9999").localeCompare(b.scheduledAt || "9999") : b.createdAt.localeCompare(a.createdAt));
  el.postList.innerHTML = posts.length ? posts.map((post) => record(post.title, [postLabels[post.type] || post.type, post.category, post.status, post.scheduledAt ? formatDate(post.scheduledAt) : ""].filter(Boolean).join(" | "), post.body, `<button class="mini-button" data-edit-post="${esc(post.id)}" type="button">Edit</button><button class="mini-button" data-copy-post="${esc(post.id)}" type="button">Copy</button><button class="mini-button" data-delete-post="${esc(post.id)}" type="button">Delete</button>`)).join("") : empty("No posts found.");
}
function savePostHistory(records) {
  if (!records.length) return;
  state.postHistory = [...records, ...state.postHistory].slice(0, 1000);
  write(keys.postHistory, state.postHistory);
}
function historyRow(item) {
  const meta = [
    item.sentAt ? formatDate(item.sentAt) : "No time",
    item.recipient ? `Recipient: ${item.recipient}` : "",
    item.contactName ? `Contact: ${item.contactName}` : "",
    item.groupName ? `Group: ${item.groupName}` : "",
    item.deliveryStatus ? `Status: ${item.deliveryStatus}` : "",
    item.telegramMessageId ? `Telegram ID: ${item.telegramMessageId}` : ""
  ].filter(Boolean).join(" | ");
  const body = item.error ? `Error: ${item.error}` : item.messagePreview || "";
  return record(item.postTitle || "Untitled post", meta, body, `<button class="mini-button" data-view="posts" data-edit-post="${esc(item.postId || "")}" type="button">Open post</button>`);
}
function pendingPostRow(post) {
  const targets = postTargets(post);
  const contactNames = (post.contacts || []).map((id) => state.contacts.find((contact) => contact.id === id)?.name).filter(Boolean);
  const groupNames = (post.groups || []).map((id) => state.groups.find((group) => group.id === id)?.name).filter(Boolean);
  const meta = [post.status || "Draft", post.scheduledAt ? `Schedule: ${formatDate(post.scheduledAt)}` : "", targets.length ? `${targets.length} recipient${targets.length === 1 ? "" : "s"}` : "No recipients", ...contactNames.map((name) => `Contact: ${name}`), ...groupNames.map((name) => `Group: ${name}`)].filter(Boolean).join(" | ");
  return record(post.title || "Untitled post", meta, post.lastError || post.body || "", `<button class="mini-button" data-view="posts" data-edit-post="${esc(post.id)}" type="button">Open post</button>`);
}
function renderPostHistory() {
  if (!el.postHistorySent || !el.postHistoryPending) return;
  const sent = state.postHistory.filter((item) => item.deliveryStatus === "Sent");
  const failed = state.postHistory.filter((item) => item.deliveryStatus === "Failed");
  const pending = state.posts.filter((post) => post.status !== "Posted");
  el.postHistorySent.innerHTML = sent.length || failed.length
    ? [...sent, ...failed].map(historyRow).join("")
    : empty("No post sharing history yet.");
  el.postHistoryPending.innerHTML = pending.length
    ? pending.map(pendingPostRow).join("")
    : empty("No pending posts.");
}
function renderSearch() {
  const query = el.globalSearch.value.trim().toLowerCase();
  if (!query) { el.globalResults.innerHTML = empty("Search across the workspace."); return; }
  const rows = [];
  for (const account of state.accounts) { const profile = profileFor(account); rows.push({ type: "Profile", title: profile.profileName, text: [accountLabel(account), profile.displayName, profile.phone, profile.status].join(" "), view: "profiles" }); }
  state.contacts.forEach((item) => rows.push({ type: "Contact", title: item.name, text: [item.handle, item.phone, item.group, item.notes].join(" "), view: "contacts" }));
  state.groups.forEach((item) => rows.push({ type: "Group", title: item.name, text: [item.type, item.status, item.members, item.notes].join(" "), view: "groups" }));
  state.channels.forEach((item) => rows.push({ type: "Channel", title: item.name, text: [item.privacy, item.invites, item.notes].join(" "), view: "channels" }));
  state.posts.forEach((item) => rows.push({ type: "Post", title: item.title, text: [item.type, item.category, (item.tags || []).join(" "), item.status, item.body].join(" "), view: "posts" }));
  const matches = rows.filter((item) => [item.type, item.title, item.text].join(" ").toLowerCase().includes(query));
  el.globalResults.innerHTML = matches.length ? matches.map((item) => record(`${item.type}: ${item.title || "Untitled"}`, item.text, "", `<button class="mini-button" data-view="${esc(item.view)}" type="button">Open</button>`)).join("") : empty("No matches found.");
}
function recipientKey(value) {
  return recipientFromGroupLine(value || "").trim().toLowerCase();
}
function recipientKeys(value) {
  return String(value || "").split(/[\s,|]+/).map(recipientKey).filter(Boolean);
}
function contactKeys(contact) {
  return [
    contactRecipient(contact),
    contact?.handle || "",
    contact?.phone || "",
    normalizeContactPhone(contact?.phone || "", contact?.countryCode || "+91")
  ].flatMap(recipientKeys).filter(Boolean);
}
function messageRecipientKeys(message) {
  return recipientKeys(message?.recipient || "");
}
function messageRecipientKey(message) {
  return messageRecipientKeys(message)[0] || "";
}
function messagePeerTokens(message) {
  return String(message?.recipient || "").split(/[\s,|]+/).map(recipientFromGroupLine).filter(Boolean);
}
function messagePeerRecipient(message) {
  const tokens = messagePeerTokens(message);
  return tokens.find((token) => token.startsWith("@") || token.startsWith("+")) || tokens[0] || messageRecipientKey(message);
}
function inboxSyncRecipients() {
  const seen = new Set();
  const recipients = [];
  const add = (value) => {
    String(value || "").split(/[\s,|]+/).map(recipientFromGroupLine).forEach((recipient) => {
      if (!recipient || (!recipient.startsWith("@") && !recipient.startsWith("+"))) return;
      const key = recipient.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      recipients.push(recipient);
    });
  };
  state.contacts.forEach((contact) => {
    add(contactRecipient(contact));
    add(contact?.handle || "");
    add(contact?.phone || "");
  });
  (state.inbox.messages || []).forEach((message) => add(message?.recipient || ""));
  return recipients.slice(0, 50);
}
function messageIdentity(message) {
  return [message?.direction || "", message?.telegramMessageId || message?.id || "", message?.text || ""].join("|");
}
function dedupeThreadMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    const key = messageIdentity(message);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function messageMatchesContact(message, contact) {
  const keys = new Set(messageRecipientKeys(message));
  return contactKeys(contact).some((key) => keys.has(key));
}
function contactStartedAt(contact) {
  const time = new Date(contact?.createdAt || contact?.updatedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
function contactThreadMessages(messages, contact) {
  const startedAt = contactStartedAt(contact);
  return dedupeThreadMessages(messages.filter((message) => messageMatchesContact(message, contact) && (!startedAt || messageTime(message) >= startedAt)));
}

function contactThreadId(contact) {
  return `contact:${contact.id}`;
}
function peerThreadId(key) {
  return `peer:${key}`;
}
function messageTime(message) {
  const time = new Date(message?.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
function inboxThreads() {
  const messages = state.inbox.messages || [];
  const query = (el.inboxSearch?.value || "").trim().toLowerCase();
  const contactMessageIds = new Set();
  const contactThreads = state.contacts.map((contact) => {
    const recipient = contactRecipient(contact);
    const threadMessages = contactThreadMessages(messages, contact);
    threadMessages.forEach((message) => { if (message?.id) contactMessageIds.add(message.id); });
    const latest = threadMessages.slice().sort((a, b) => messageTime(b) - messageTime(a))[0] || null;
    return {
      id: contactThreadId(contact),
      key: recipientKey(recipient || contact.name),
      label: contact.name || recipient || "Saved contact",
      recipient,
      detail: [recipient, contact.group].filter(Boolean).join(" | "),
      latest,
      contact,
      messages: threadMessages
    };
  });

  const peerGroups = new Map();
  messages.forEach((message) => {
    if (message?.id && contactMessageIds.has(message.id)) return;
    const key = messageRecipientKey(message);
    if (!key) return;
    if (!peerGroups.has(key)) {
      const recipient = messagePeerRecipient(message);
      peerGroups.set(key, {
        id: peerThreadId(key),
        key,
        label: recipient || "Telegram chat",
        recipient: recipient.startsWith("@") || recipient.startsWith("+") ? recipient : "",
        detail: recipient || key,
        latest: null,
        messages: []
      });
    }
    const thread = peerGroups.get(key);
    thread.messages.push(message);
    thread.latest = thread.messages.slice().sort((a, b) => messageTime(b) - messageTime(a))[0] || null;
  });

  const rows = [...contactThreads, ...peerGroups.values()].filter((thread) => {
    const searchText = [thread.label, thread.recipient, thread.detail, thread.latest?.text].join(" ").toLowerCase();
    return !query || searchText.includes(query);
  }).sort((a, b) => {
    const byTime = messageTime(b.latest) - messageTime(a.latest);
    return byTime || a.label.localeCompare(b.label);
  });

  if (!rows.some((thread) => thread.id === state.inbox.selectedThread)) {
    state.inbox.selectedThread = rows[0]?.id || "";
  }
  return rows;
}

function currentInboxThread() {
  return inboxThreads().find((thread) => thread.id === state.inbox.selectedThread) || null;
}
function messagesForThread(thread) {
  if (!thread) return [];
  const messages = Array.isArray(thread.messages)
    ? thread.messages
    : thread.contact
      ? contactThreadMessages(state.inbox.messages || [], thread.contact)
      : (state.inbox.messages || []).filter((message) => messageRecipientKey(message) === thread.key);
  return dedupeThreadMessages(messages).slice().sort((a, b) => messageTime(a) - messageTime(b));
}
function addInboxMessage(message) {
  if (!message?.id) return;
  state.inbox.messages = [message, ...(state.inbox.messages || []).filter((item) => item.id !== message.id)];
}
function shortMessageTime(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
}
function renderInboxMessageBubble(message, inboundLabel = "Reply") {
  const direction = message.direction === "outbound" ? "outbound" : "inbound";
  const speaker = direction === "outbound" ? "You" : inboundLabel;
  const ticks = direction === "outbound" ? '<span class="message-status" aria-label="Sent">&#10003;&#10003;</span>' : "";
  return `<article class="message-bubble ${direction}"><p>${esc(message.text || "")}</p><div class="message-meta"><span class="message-speaker">${esc(speaker)}</span><time datetime="${esc(message.createdAt || "")}">${esc(shortMessageTime(message.createdAt))}</time>${ticks}</div></article>`;
}
function renderMultiChatBoard(threads) {
  if (!el.inboxMultiBoard) return;
  el.inboxMultiBoard.innerHTML = threads.length ? threads.map((thread) => {
    const messages = messagesForThread(thread).slice(-12);
    const active = thread.id === state.inbox.selectedThread ? " active" : "";
    const detail = thread.detail || thread.recipient || "No recipient saved";
    const canSend = !!thread.recipient && !state.inbox.loading;
    const disabled = canSend ? "" : " disabled";
    const draft = state.inbox.drafts?.[thread.id] || "";
    const placeholder = thread.recipient ? `Message ${thread.label}` : "Add username or phone first";
    const body = messages.length ? messages.map((message) => renderInboxMessageBubble(message, thread.label)).join("") : empty(thread.recipient ? "No messages yet." : "Add a username or phone to send.");
    return `<article class="multi-chat-column${active}"><header class="multi-chat-heading">${chatAvatar(thread.label, "small")}<div class="multi-chat-header-text"><button class="multi-chat-title" type="button" data-inbox-thread="${esc(thread.id)}"><span>${esc(thread.label)}</span><small>${esc(shortMessageTime(thread.latest?.createdAt || ""))}</small></button><p>${esc(detail)}</p></div></header><div class="multi-chat-messages">${body}</div><form class="multi-chat-composer" data-inbox-quick-form="${esc(thread.id)}" novalidate><textarea data-inbox-draft="${esc(thread.id)}" rows="1" maxlength="4096" placeholder="${esc(placeholder)}"${disabled}>${esc(draft)}</textarea><button class="mini-button" type="submit"${disabled}>Send</button></form></article>`;
  }).join("") : empty("No saved contacts or messages yet.");
  requestAnimationFrame(() => {
    el.inboxMultiBoard.querySelectorAll(".multi-chat-messages").forEach((node) => { node.scrollTop = node.scrollHeight; });
  });
}
async function sendInboxThreadMessage(threadId, messageInput) {
  const thread = inboxThreads().find((item) => item.id === threadId) || currentInboxThread();
  const text = String(messageInput?.value ?? messageInput ?? "").trim();
  if (!thread) return status(el.inboxStatus, "Select a chat first.", "error");
  if (!thread.recipient) return status(el.inboxStatus, "Add a username or phone to this contact before sending.", "error");
  if (!text) return status(el.inboxStatus, "Type a message first.", "error");
  state.inbox.selectedThread = thread.id;
  if (messageInput?.dataset?.inboxDraft) state.inbox.drafts[thread.id] = text;
  const form = messageInput?.closest?.("form");
  const controls = form ? Array.from(form.querySelectorAll("textarea, button")) : [el.inboxMessage, el.inboxSendButton].filter(Boolean);
  controls.forEach((control) => { control.disabled = true; });
  status(el.inboxStatus, `Sending to ${thread.label}...`);
  try {
    const response = await sendMessage(thread.recipient, text, el.inboxStatus, currentAccount()?.id || "", { firstName: thread.contact?.name || thread.label });
    addInboxMessage(response?.message);
    if (messageInput && "value" in messageInput) messageInput.value = "";
    delete state.inbox.drafts[thread.id];
    renderInbox();
    await loadInboxMessages({ quiet: true });
    status(el.inboxStatus, "Message sent.", "success");
  } catch (error) {
    onError(error, el.inboxStatus);
  } finally {
    renderInbox();
  }
}
function validInboxView(view) {
  return Object.prototype.hasOwnProperty.call(inboxViewLabels, view) ? view : "split";
}
function setInboxView(view) {
  state.inbox.view = validInboxView(view);
  localStorage.setItem(keys.inboxView, state.inbox.view);
  renderInbox();
  status(el.inboxStatus, `${inboxViewLabels[state.inbox.view]} view active.`, "success");
}
function renderInboxViewControls() {
  const view = validInboxView(state.inbox.view);
  state.inbox.view = view;
  if (el.inboxShell) {
    el.inboxShell.dataset.view = view;
    el.inboxShell.setAttribute("aria-label", `${inboxViewLabels[view]} message view`);
  }
  el.inboxViewButtons.forEach((button) => {
    const active = button.dataset.inboxView === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.title = `${inboxViewLabels[button.dataset.inboxView] || "Message"} view`;
  });
}
function renderInbox() {
  if (!el.inboxThreadList || !el.inboxThread || !el.inboxActiveHeading || !el.inboxMultiBoard) return;
  renderInboxViewControls();
  const account = currentAccount();
  if (!account) {
    el.inboxThreadList.innerHTML = empty("Connect and select a Telegram profile first.");
    el.inboxActiveHeading.innerHTML = "<h3>No profile selected</h3><p class=\"muted\">Add a number before opening chats.</p>";
    el.inboxThread.innerHTML = "";
    el.inboxMultiBoard.innerHTML = "";
    el.inboxSendButton.disabled = true;
    el.inboxMessage.disabled = true;
    return;
  }

  const threads = inboxThreads();
  el.inboxThreadList.innerHTML = threads.length ? threads.map((thread) => {
    const active = thread.id === state.inbox.selectedThread ? " active" : "";
    const preview = thread.latest?.text || (thread.recipient ? "No messages yet" : "Telegram chat");
    const unread = thread.latest?.direction === "inbound" ? '<span class="unread-dot" aria-label="Unread reply"></span>' : "";
    return `<button class="chat-thread-button${active}" type="button" data-inbox-thread="${esc(thread.id)}">${chatAvatar(thread.label)}<span class="chat-thread-main"><span class="chat-thread-title"><span>${esc(thread.label)}</span><span class="chat-thread-time">${esc(shortMessageTime(thread.latest?.createdAt || ""))}</span></span><span class="chat-thread-meta">${esc(thread.detail || thread.recipient || "No recipient saved")}</span><span class="chat-thread-preview"><span>${esc(preview)}</span>${unread}</span></span></button>`;
  }).join("") : empty("No saved contacts or messages yet.");
  renderMultiChatBoard(threads);

  const thread = currentInboxThread();
  const canSend = !!thread?.recipient;
  el.inboxSendButton.disabled = !canSend || state.inbox.loading;
  el.inboxMessage.disabled = !canSend || state.inbox.loading;

  if (!thread) {
    el.inboxActiveHeading.innerHTML = "<h3>Select a chat</h3><p class=\"muted\">Saved contacts and incoming replies will appear here.</p>";
    el.inboxThread.innerHTML = "";
    return;
  }

  el.inboxActiveHeading.innerHTML = `<div class="chat-heading-profile">${chatAvatar(thread.label)}<div><h3>${esc(thread.label)}</h3><p class="muted">${esc(thread.detail || thread.recipient || "Add a username or phone to this contact before sending.")}</p></div></div>`;
  const messages = messagesForThread(thread);
  el.inboxThread.innerHTML = messages.length ? messages.map((message) => renderInboxMessageBubble(message, thread.label)).join("") : empty(canSend ? "No messages yet. Type below to start this chat." : "This contact needs a username or phone before you can send.");
  requestAnimationFrame(() => { el.inboxThread.scrollTop = el.inboxThread.scrollHeight; });
}
async function loadInboxMessages(options = {}) {
  if (!el.inboxThreadList) return;
  const account = currentAccount();
  if (!account) { renderInbox(); return; }
  if (state.inbox.loading) return;
  state.inbox.loading = true;
  if (!options.quiet) status(el.inboxStatus, "Loading inbox...");
  renderInbox();
  try {
    const query = new URLSearchParams({ accountId: account.id, limit: "500", sync: options.quiet ? "1" : "force" });
    inboxSyncRecipients().forEach((recipient) => query.append("recipient", recipient));
    const data = await api(`/v1/messages?${query.toString()}`);
    state.inbox.messages = Array.isArray(data.messages) ? data.messages : [];
    state.inbox.lastSyncAt = Date.now();
    if (!options.quiet) status(el.inboxStatus, "Messages are up to date.", "success");
  } catch (error) {
    onError(error, el.inboxStatus);
  } finally {
    state.inbox.loading = false;
    renderInbox();
  }
}
function renderSettings() { $("setting-api").value = state.settings.api || ""; $("setting-telegram").value = state.settings.telegram || ""; $("setting-session").value = state.settings.session || "Browser session"; $("setting-proxy").value = state.settings.proxy || ""; $("setting-storage").value = state.settings.storage || "Browser local workspace"; $("setting-theme").value = state.settings.theme || "Dark mode"; }
function applyTheme() { document.body.classList.toggle("light-mode", state.settings.theme === "Light mode"); }
function backupData() { return { version: 1, exportedAt: new Date().toISOString(), profiles: state.profiles, contacts: state.contacts, groups: state.groups, channels: state.channels, posts: state.posts, postHistory: state.postHistory, settings: state.settings }; }
function render() { renderProfileSelect(); renderDashboard(); renderAccounts(); renderProfileForm(); renderProfileList(); renderApplications(); renderContacts(); renderInbox(); renderGroups(); renderChannels(); renderPostContacts(); renderPostGroups(); renderPostPreview(); renderPosts(); renderPostHistory(); renderSearch(); renderSettings(); }
function setView(view) { state.activeView = titles[view] ? view : "dashboard"; const [kicker, title] = titles[state.activeView] || titles.dashboard; el.viewKicker.textContent = kicker; el.viewTitle.textContent = title; $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.activeView)); $$(".view").forEach((section) => { const active = section.id === `view-${state.activeView}`; section.hidden = !active; section.classList.toggle("active-view", active); }); render(); if (state.activeView === "inbox") void loadInboxMessages({ quiet: true }); }
async function loadAccounts() { const data = await api("/v1/telegram/accounts"); state.accounts = data.accounts; state.accounts.forEach(profileFor); ensureSelected(); write(keys.profiles, state.profiles); render(); if (state.activeView === "inbox") void loadInboxMessages({ quiet: true }); }
async function sendMessage(recipient, message, node, accountId = "", options = {}) {
  const account = state.accounts.find((item) => item.id === accountId) || currentAccount();
  const mediaUrl = (options.mediaUrl || "").trim();
  if (!account || !recipient || (!message && !mediaUrl)) { status(node, "Choose a profile, recipient, and message or media.", "error"); return null; }
  return api("/v1/messages", { method: "POST", body: { accountId: account.id, recipient, message, mediaUrl, mediaType: options.mediaType || "", firstName: options.firstName || "", lastName: options.lastName || "" } });
}
function postMessage(post) { return (post.body || post.title || "").trim(); }
function postMediaUrl(post) { return post.mediaUrl && post.type !== "text" ? post.mediaUrl.trim() : ""; }
async function sendPostToTargets(post, node, options = {}) {
  const message = postMessage(post);
  const mediaUrl = postMediaUrl(post);
  const targets = postTargets(post);
  if (!targets.length || (!message && !mediaUrl)) {
    const messageText = "Choose a manual target, saved contact, or saved group, and add text or media.";
    if (options.throwOnError) throw new Error(messageText);
    status(node, messageText, "error");
    return { sentCount: 0, targets, failures: [messageText] };
  }
  const sender = state.accounts.find((account) => account.id === post.accountId) || currentAccount();
  if (!sender) {
    const messageText = "Select a connected profile first.";
    if (options.throwOnError) throw new Error(messageText);
    status(node, messageText, "error");
    return { sentCount: 0, targets, failures: [messageText] };
  }
  if (node) status(node, `Sending to ${targets.length} recipient${targets.length === 1 ? "" : "s"}...`);
  const senderProfile = profileFor(sender);
  const history = [];
  const failures = [];
  let sentCount = 0;
  for (const target of targets) {
    const baseHistory = {
      id: uid("share"),
      postId: post.id,
      postTitle: post.title || "Untitled post",
      accountId: sender.id,
      profileName: senderProfile?.profileName || sender.displayName || "Telegram profile",
      recipient: target.recipient,
      contactName: target.kind === "contact" ? target.source : "",
      groupName: target.kind === "group" ? target.source : "",
      source: target.source,
      mediaType: mediaUrl ? post.type : "text",
      mediaUrl,
      messagePreview: message.slice(0, 240)
    };
    try {
      const response = await sendMessage(target.recipient, message, node, sender.id, { mediaUrl, mediaType: mediaUrl ? post.type : "", firstName: target.firstName || target.source || "" });
      sentCount += 1;
      history.push({ ...baseHistory, deliveryStatus: "Sent", sentAt: response?.sent?.sentAt || new Date().toISOString(), telegramMessageId: response?.sent?.messageId || "", error: "" });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "failed";
      failures.push(`${target.recipient}: ${errorText}`);
      history.push({ ...baseHistory, deliveryStatus: "Failed", sentAt: new Date().toISOString(), telegramMessageId: "", error: errorText });
    }
  }
  savePostHistory(history);
  renderPostHistory();
  return { sentCount, targets, failures };
}
async function sendScheduledPost(post) {
  if (state.scheduledSending.has(post.id)) return;
  state.scheduledSending.add(post.id);
  try {
    const result = await sendPostToTargets(post, el.postStatusMessage, { throwOnError: true });
    const index = state.posts.findIndex((item) => item.id === post.id);
    if (index === -1) return;
    state.posts[index] = { ...state.posts[index], status: result.failures.length ? "Failed" : "Posted", sentAt: new Date().toISOString(), lastError: result.failures.join("; "), updatedAt: new Date().toISOString() };
    write(keys.posts, state.posts);
    render();
    status(el.postStatusMessage, result.failures.length ? `Scheduled post failed: ${result.failures.slice(0, 3).join("; ")}` : `Scheduled post sent to ${result.sentCount} recipient${result.sentCount === 1 ? "" : "s"}.`, result.failures.length ? "error" : "success");
  } catch (error) {
    const index = state.posts.findIndex((item) => item.id === post.id);
    if (index !== -1) {
      state.posts[index] = { ...state.posts[index], status: "Failed", lastError: error instanceof Error ? error.message : "Scheduled send failed", updatedAt: new Date().toISOString() };
      write(keys.posts, state.posts);
      render();
    }
    status(el.postStatusMessage, error instanceof Error ? error.message : "Scheduled send failed.", "error");
  } finally {
    state.scheduledSending.delete(post.id);
  }
}
function runScheduler() {
  if (!state.user || !currentAccount()) return;
  const now = Date.now();
  state.posts.filter((post) => post.status === "Scheduled" && post.scheduledAt && new Date(post.scheduledAt).getTime() <= now).forEach((post) => { void sendScheduledPost(post); });
}
async function deleteAccount(account) { if (!confirm(`Delete ${profileFor(account)?.profileName || account.displayName}?`)) return; await api(`/v1/telegram/accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" }); delete state.profiles[account.id]; write(keys.profiles, state.profiles); await loadAccounts(); }function resetLogin() { state.login = { challengeId: "", stage: "phone" }; if (el.code) el.code.value = ""; if (el.telegramPassword) el.telegramPassword.value = ""; setLoginStage("phone"); if (el.connectStatus) status(el.connectStatus); }
function setLoginStage(stage) {
  state.login.stage = stage;
  const isPhone = stage === "phone", isCode = stage === "code", isPassword = stage === "password";
  el.phoneForm.hidden = !isPhone; el.codeForm.hidden = !isCode; el.passwordForm.hidden = !isPassword;
  el.connectStep.textContent = isPhone ? "1 of 3" : isCode ? "2 of 3" : "3 of 3";
  el.connectCopy.textContent = isPhone ? "Use the full phone number with country code. Telegram will deliver a verification code." : isCode ? "Enter the code Telegram sent. It is used once and is not saved by this page." : "This Telegram account uses two-factor authentication. Enter its password to finish connecting.";
  if (isCode) el.code.focus(); if (isPassword) el.telegramPassword.focus();
}
async function completeConnection(data) { resetLogin(); el.phone.value = ""; if (el.phoneCountryCode) el.phoneCountryCode.value = "+91"; await loadAccounts(); selectAccount(data.account.id); status(el.connectStatus, `${data.account.displayName} is connected and ready to use.`, "success"); }

el.passwordSignInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = el.username.value.trim(), password = el.loginPassword.value;
  if (!username || !password) return status(el.signInStatus, "Enter username and password.", "error");
  busy(el.passwordSignInForm, true); status(el.signInStatus, "Opening workspace...");
  try { const data = await api("/v1/auth/password", { method: "POST", body: { username, password } }); signedIn(data.user); await loadAccounts(); }
  catch (error) { onError(error, el.signInStatus); }
  finally { busy(el.passwordSignInForm, false); }
});
el.tokenSignInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const accessToken = el.accessToken.value.trim();
  if (!accessToken) return status(el.signInStatus, "Enter your access token.", "error");
  busy(el.tokenSignInForm, true); status(el.signInStatus, "Opening workspace...");
  try { const data = await api("/v1/auth/session", { method: "POST", body: { accessToken } }); el.accessToken.value = ""; signedIn(data.user); await loadAccounts(); }
  catch (error) { onError(error, el.signInStatus); }
  finally { busy(el.tokenSignInForm, false); }
});
el.signOut.addEventListener("click", async () => { try { await api("/v1/auth/session", { method: "DELETE" }); } catch {} signedOut(); });
el.refreshAccounts.addEventListener("click", async () => { status(el.messageStatus, "Refreshing accounts..."); try { await loadAccounts(); status(el.messageStatus, "Account list is up to date.", "success"); } catch (error) { onError(error, el.messageStatus); } });
el.profileSelect.addEventListener("change", () => selectAccount(el.profileSelect.value));

el.phoneForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const phone = loginPhoneFromForm();
  if (!phone) return status(el.connectStatus, "Enter a phone number.", "error");
  busy(el.phoneForm, true); status(el.connectStatus, "Asking Telegram to send a verification code...");
  try { const data = await api("/v1/telegram/login/start", { method: "POST", body: { phone } }); state.login.challengeId = data.challengeId; setLoginStage("code"); status(el.connectStatus, `A code was sent through ${data.codeDelivery === "sms" ? "SMS" : "the Telegram app"}.`, "success"); }
  catch (error) { onError(error, el.connectStatus); }
  finally { busy(el.phoneForm, false); }
});
el.codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = el.code.value.trim();
  if (!state.login.challengeId || !code) return status(el.connectStatus, "Enter the verification code.", "error");
  busy(el.codeForm, true); status(el.connectStatus, "Verifying code...");
  try { const data = await api(`/v1/telegram/login/${encodeURIComponent(state.login.challengeId)}/code`, { method: "POST", body: { code } }); data.status === "password_required" ? (setLoginStage("password"), status(el.connectStatus, "Two-factor password required.")) : await completeConnection(data); }
  catch (error) { onError(error, el.connectStatus); }
  finally { busy(el.codeForm, false); el.code.value = ""; }
});
el.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = el.telegramPassword.value;
  if (!state.login.challengeId || !password) return status(el.connectStatus, "Enter the two-factor password.", "error");
  busy(el.passwordForm, true); status(el.connectStatus, "Connecting your Telegram account...");
  try { const data = await api(`/v1/telegram/login/${encodeURIComponent(state.login.challengeId)}/password`, { method: "POST", body: { password } }); await completeConnection(data); }
  catch (error) { onError(error, el.connectStatus); }
  finally { busy(el.passwordForm, false); el.telegramPassword.value = ""; }
});

el.profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const account = currentAccount();
  if (!account) return status(el.profileStatusMessage, "Select a profile first.", "error");
  state.profiles[account.id] = { profileName: $("profile-name").value.trim() || account.displayName, displayName: $("profile-display-name").value.trim(), username: $("profile-username").value.trim(), phone: $("profile-phone").value.trim(), status: $("profile-status").value, avatar: $("profile-avatar").value.trim(), configNumbers: $("profile-config-numbers").value.trim(), description: $("profile-description").value.trim() };
  write(keys.profiles, state.profiles); render(); status(el.profileStatusMessage, "Profile saved.", "success");
});
el.quickSendForm.addEventListener("submit", async (event) => {
  event.preventDefault(); busy(el.quickSendForm, true); status(el.messageStatus, "Sending from selected profile...");
  try { const response = await sendMessage($("quick-recipient").value.trim(), $("quick-message").value.trim(), el.messageStatus); if (!response) return; addInboxMessage(response?.message); $("quick-message").value = ""; if (state.activeView === "inbox") renderInbox(); status(el.messageStatus, "Message sent.", "success"); }
  catch (error) { onError(error, el.messageStatus); }
  finally { busy(el.quickSendForm, false); }
});

el.contactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("contact-name").value.trim(); if (!name) return status(el.contactStatus, "Contact name is required.", "error");
  const existingId = $("contact-id").value;
  const existing = state.contacts.find((row) => row.id === existingId);
  const now = new Date().toISOString();
  const item = { id: existingId || uid("contact"), name, handle: $("contact-handle").value.trim(), countryCode: el.contactCountryCode.value || "+91", phone: contactPhoneFromForm(), group: $("contact-group").value.trim(), notes: $("contact-notes").value.trim(), createdAt: existing?.createdAt || now, updatedAt: now };
  const index = state.contacts.findIndex((row) => row.id === item.id); index === -1 ? state.contacts.unshift(item) : state.contacts[index] = item;
  write(keys.contacts, state.contacts); clearContactForm(); render(); status(el.contactStatus, "Contact saved.", "success");
});
el.groupForm.addEventListener("submit", (event) => {
  event.preventDefault(); const name = $("group-name").value.trim(); if (!name) return;
  const item = { id: $("group-id").value || uid("group"), name, type: $("group-type").value, status: $("group-status").value, members: $("group-members").value.trim(), notes: $("group-notes").value.trim(), updatedAt: new Date().toISOString() };
  const index = state.groups.findIndex((row) => row.id === item.id); index === -1 ? state.groups.unshift(item) : state.groups[index] = item;
  write(keys.groups, state.groups); el.groupForm.reset(); $("group-id").value = ""; render();
});
el.channelForm.addEventListener("submit", (event) => {
  event.preventDefault(); const name = $("channel-name").value.trim(); if (!name) return;
  const item = { id: $("channel-id").value || uid("channel"), name, privacy: $("channel-privacy").value, invites: $("channel-invites").value.trim(), notes: $("channel-notes").value.trim(), updatedAt: new Date().toISOString() };
  const index = state.channels.findIndex((row) => row.id === item.id); index === -1 ? state.channels.unshift(item) : state.channels[index] = item;
  write(keys.channels, state.channels); el.channelForm.reset(); $("channel-id").value = ""; render();
});el.postForm.addEventListener("submit", (event) => { event.preventDefault(); savePost(); });
["post-title", "post-type", "post-category", "post-tags", "post-status", "post-scheduled-at", "post-media-url", "post-body", "post-recipient"].forEach((id) => { $(id).addEventListener("input", renderPostPreview); $(id).addEventListener("change", renderPostPreview); });
el.postContactTargets.addEventListener("change", renderPostPreview);
el.postGroupTargets.addEventListener("change", renderPostPreview);
[el.numberSearch, el.numberStatusFilter].forEach((node) => node.addEventListener("input", renderAccounts));
el.numberStatusFilter.addEventListener("change", renderAccounts);
el.contactSearch.addEventListener("input", renderContacts);
el.inboxSearch.addEventListener("input", renderInbox);
el.inboxRefresh.addEventListener("click", () => void loadInboxMessages());
el.inboxForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendInboxThreadMessage(state.inbox.selectedThread, el.inboxMessage);
});
el.postSearch.addEventListener("input", renderPosts); el.postFilterType.addEventListener("change", renderPosts); el.postSort.addEventListener("change", renderPosts);
el.globalSearch.addEventListener("input", renderSearch);

$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.settings = { api: $("setting-api").value.trim(), telegram: $("setting-telegram").value.trim(), session: $("setting-session").value, proxy: $("setting-proxy").value.trim(), storage: $("setting-storage").value, theme: $("setting-theme").value };
  write(keys.settings, state.settings); applyTheme(); status(el.settingsStatus, "Settings saved.", "success");
});

document.addEventListener("input", (event) => {
  const textarea = event.target.closest?.("textarea[data-inbox-draft]");
  if (!textarea) return;
  state.inbox.drafts[textarea.dataset.inboxDraft] = textarea.value;
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest?.("form[data-inbox-quick-form]");
  if (!form) return;
  event.preventDefault();
  await sendInboxThreadMessage(form.dataset.inboxQuickForm, form.querySelector("textarea"));
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.jump) setView(button.dataset.jump);
  if (button.dataset.inboxView) setInboxView(button.dataset.inboxView);
  if (button.dataset.resetLogin !== undefined) resetLogin();
  if (button.id === "contact-clear") clearContactForm();
  if (button.id === "group-clear") { el.groupForm.reset(); $("group-id").value = ""; }
  if (button.id === "channel-clear") { el.channelForm.reset(); $("channel-id").value = ""; }
  if (button.id === "post-clear") clearPost();
  if (button.id === "export-contacts") { el.contactImportJson.value = JSON.stringify(state.contacts, null, 2); status(el.contactStatus, "Contacts exported.", "success"); }
  if (button.id === "import-contacts") {
    try { const parsed = JSON.parse(el.contactImportJson.value || "[]"); if (!Array.isArray(parsed)) throw new Error("Contact JSON must be an array."); state.contacts = parsed.map((item) => ({ ...item, id: item.id || uid("contact"), countryCode: item.countryCode || splitContactPhone(item.phone).countryCode, createdAt: item.createdAt || item.updatedAt || new Date().toISOString(), updatedAt: item.updatedAt || item.createdAt || new Date().toISOString() })); write(keys.contacts, state.contacts); render(); status(el.contactStatus, "Contacts imported.", "success"); }
    catch (error) { status(el.contactStatus, error instanceof Error ? error.message : "Import failed.", "error"); }
  }
  if (button.id === "post-schedule") { if (!$("post-scheduled-at").value) return status(el.postStatusMessage, "Choose a scheduled date.", "error"); savePost("Scheduled"); status(el.postStatusMessage, "Post saved as scheduled.", "success"); }
  if (button.id === "post-send-now") {
    const post = savePost();
    if (!post) return;
    const result = await sendPostToTargets(post, el.postStatusMessage);
    if (result.failures.length) {
      status(el.postStatusMessage, `Sent ${result.sentCount}/${result.targets.length}. Failed: ${result.failures.slice(0, 3).join("; ")}`, "error");
      return;
    }
    $("post-status").value = "Posted";
    savePost("Posted");
    status(el.postStatusMessage, `Post sent to ${result.sentCount} recipient${result.sentCount === 1 ? "" : "s"}.`, "success");
  }  if (button.id === "backup-export") { el.backupJson.value = JSON.stringify(backupData(), null, 2); status(el.backupStatus, "Backup exported.", "success"); }
  if (button.id === "backup-import") {
    try { const data = JSON.parse(el.backupJson.value || "{}"); state.profiles = data.profiles && typeof data.profiles === "object" ? data.profiles : state.profiles; state.contacts = Array.isArray(data.contacts) ? data.contacts : state.contacts; state.groups = Array.isArray(data.groups) ? data.groups : state.groups; state.channels = Array.isArray(data.channels) ? data.channels : state.channels; state.posts = Array.isArray(data.posts) ? data.posts : state.posts; state.postHistory = Array.isArray(data.postHistory) ? data.postHistory : state.postHistory; state.settings = data.settings && typeof data.settings === "object" ? { ...state.settings, ...data.settings } : state.settings; saveAll(); applyTheme(); render(); status(el.backupStatus, "Backup restored.", "success"); }
    catch (error) { status(el.backupStatus, error instanceof Error ? error.message : "Restore failed.", "error"); }
  }
  const inboxThread = button.dataset.inboxThread; if (inboxThread) { state.inbox.selectedThread = inboxThread; renderInbox(); if (state.inbox.view === "multi") requestAnimationFrame(() => el.inboxMultiBoard?.querySelector(".multi-chat-column.active textarea:not(:disabled)")?.focus()); }
  const accountId = button.dataset.selectAccount; if (accountId) selectAccount(accountId);
  const editAccount = button.dataset.editAccount; if (editAccount) { selectAccount(editAccount); setView("profiles"); }
  const deleteAccountId = button.dataset.deleteAccount; if (deleteAccountId) { const account = state.accounts.find((item) => item.id === deleteAccountId); if (account) { try { await deleteAccount(account); status(el.messageStatus, "Profile deleted.", "success"); } catch (error) { onError(error, el.messageStatus); } } }
  const editContact = button.dataset.editContact; if (editContact) { const item = state.contacts.find((row) => row.id === editContact); if (item) fillContactForm(item); }
  const deleteContact = button.dataset.deleteContact; if (deleteContact) { state.contacts = state.contacts.filter((row) => row.id !== deleteContact); write(keys.contacts, state.contacts); render(); }
  const editGroup = button.dataset.editGroup; if (editGroup) { const item = state.groups.find((row) => row.id === editGroup); if (item) { $("group-id").value = item.id; $("group-name").value = item.name || ""; $("group-type").value = item.type || "Private"; $("group-status").value = item.status || "Created"; $("group-members").value = item.members || ""; $("group-notes").value = item.notes || ""; } }
  const deleteGroup = button.dataset.deleteGroup; if (deleteGroup) { state.groups = state.groups.filter((row) => row.id !== deleteGroup); write(keys.groups, state.groups); render(); }
  const editChannel = button.dataset.editChannel; if (editChannel) { const item = state.channels.find((row) => row.id === editChannel); if (item) { $("channel-id").value = item.id; $("channel-name").value = item.name || ""; $("channel-privacy").value = item.privacy || "Private"; $("channel-invites").value = item.invites || ""; $("channel-notes").value = item.notes || ""; } }
  const deleteChannel = button.dataset.deleteChannel; if (deleteChannel) { state.channels = state.channels.filter((row) => row.id !== deleteChannel); write(keys.channels, state.channels); render(); }
  const editPost = button.dataset.editPost; if (editPost) { const item = state.posts.find((row) => row.id === editPost); if (item) fillPost(item); }
  const copyPost = button.dataset.copyPost; if (copyPost) { const item = state.posts.find((row) => row.id === copyPost); if (item) { state.posts.unshift({ ...item, id: uid("post"), title: `${item.title} copy`, status: "Draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); write(keys.posts, state.posts); render(); } }
  const deletePost = button.dataset.deletePost; if (deletePost) { state.posts = state.posts.filter((row) => row.id !== deletePost); write(keys.posts, state.posts); render(); }
});

(async function restoreSession() {
  try { const data = await api("/v1/me"); signedIn(data.user); await loadAccounts(); }
  catch (error) { signedOut(error instanceof ApiError && error.status === 401 ? "" : "The service is unavailable. Please try again."); }
  setView("dashboard");
  runScheduler();
  setInterval(runScheduler, 30000);
  setInterval(() => { if (state.user && state.activeView === "inbox") void loadInboxMessages({ quiet: true }); }, 10000);
})();