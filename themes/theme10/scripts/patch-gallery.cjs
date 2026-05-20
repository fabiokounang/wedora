const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "..", "partials", "gallery.ejs");
let s = fs.readFileSync(p, "utf8");
const ulStart = s.indexOf('<ul class="splide__list"');
const ulInnerStart = s.indexOf(">", ulStart) + 1;
const ulEnd = s.indexOf("</ul>", ulInnerStart);
const before = s.slice(0, ulInnerStart);
const after = s.slice(ulEnd);
const mid = `
                                                                                                        <% (gallery || []).forEach(function (g) {
                                                                                                          const full = g.image_url || g.thumbnail_url;
                                                                                                          const thumb = g.thumbnail_url || g.image_url;
                                                                                                          if (!full) return;
                                                                                                        %>
                                                                                                        <li class="splide__slide position-relative">
                                                        <a href="<%= full %>">
                                                            <img src="<%= thumb %>" alt="img-gallery" class="img-gallery">
                                                        </a>
                                                    </li>
                                                                                                        <% }); %>
                                                                                                        <% if (!(gallery || []).length) { %>
                                                                                                        <li class="splide__slide position-relative">
                                                        <a href="https://media.viding.co/dmlkaW5nIGNvIGltYWdlIHByb3h5IGJ5IGZseS5pbw/rs:auto:0:0:1/g:no/aHR0cHM6Ly9wZXRyYS52aWRpbmcuY28vZ2FsbGVyeS8yZ2MzdlRpTkYzdVNCNnE1MlBHUnBaNFdkN1BzU0FzakVqbjhGUjBVLmpwZw.webp">
                                                            <img src="https://media.viding.co/dmlkaW5nIGNvIGltYWdlIHByb3h5IGJ5IGZseS5pbw/rs:auto:720:0:1/g:no/aHR0cHM6Ly9wZXRyYS52aWRpbmcuY28vZ2FsbGVyeS8yZ2MzdlRpTkYzdVNCNnE1MlBHUnBaNFdkN1BzU0FzakVqbjhGUjBVLmpwZw.webp" alt="img-gallery" class="img-gallery">
                                                        </a>
                                                    </li>
                                                                                                        <% } %>
`;
fs.writeFileSync(p, before + mid + after, "utf8");
console.log("patched gallery");
