const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "..", "partials", "venue-rsvp.ejs");
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const pre = lines.slice(0, 38).join("\n");
const suf = lines.slice(196).join("\n");
const mid = `
                                            <div class="row justify-content-center row-venue">
<% if (hasSection("events") && (events || []).length) { %>
<% (events || []).forEach(function (ev) { %>
<%- include("venue-event-card", { ev, helpers }) %>
<% }); %>
<% } else if (hasSection("events")) { %>
<div class="col-12 text-center"><p class="text-white">Detail acara akan diumumkan.</p></div>
<% } %>
                                                                                                                                                </div>`;
fs.writeFileSync(p, pre + mid + "\n" + suf, "utf8");
console.log("patched", p);
