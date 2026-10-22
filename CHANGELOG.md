# Changelog

## [0.3.0](https://github.com/barzoj/somtoday-mcp/compare/v0.2.0...v0.3.0) (2026-10-22)


### Features

* add MCP Registry metadata (server.json, mcpName) ([#54](https://github.com/barzoj/somtoday-mcp/issues/54)) ([9c866b3](https://github.com/barzoj/somtoday-mcp/commit/9c866b31562378232a66fe705b5d4da8e4565b1e))

## [0.2.0](https://github.com/barzoj/somtoday-mcp/compare/v0.1.1...v0.2.0) (2026-10-22)


### Features

* **assignments:** hide past items without a digital hand-in in status=open ([#51](https://github.com/barzoj/somtoday-mcp/issues/51)) ([2ab01d6](https://github.com/barzoj/somtoday-mcp/commit/2ab01d633b17ad068b59b360b9ce6522349e0d46))
* **assignments:** merge near-duplicate assignments ([#53](https://github.com/barzoj/somtoday-mcp/issues/53)) ([06ac896](https://github.com/barzoj/somtoday-mcp/commit/06ac896263b62a8e3c11b0092757beb44a613c89))
* **lessons:** show the appointment type and cancellations ([#50](https://github.com/barzoj/somtoday-mcp/issues/50)) ([8d35ae5](https://github.com/barzoj/somtoday-mcp/commit/8d35ae550a88b46604560626cb0bb74dcb1d0b7b))
* **signing:** read the signed document of a signing request ([#45](https://github.com/barzoj/somtoday-mcp/issues/45)) ([74213cf](https://github.com/barzoj/somtoday-mcp/commit/74213cff222273ea53e1e973205a7f0b34c71f51))


### Bug Fixes

* **assignments:** always set teLaat as a boolean ([#46](https://github.com/barzoj/somtoday-mcp/issues/46)) ([4c83879](https://github.com/barzoj/somtoday-mcp/commit/4c83879fafae2f9f0be6d435e304536afba1dcf8))
* **schedule:** drop the routine enrolment notice and keep empty days ([#47](https://github.com/barzoj/somtoday-mcp/issues/47)) ([f451f1a](https://github.com/barzoj/somtoday-mcp/commit/f451f1acdfecdaca93164d34053f1b105fe0da4c))

## [0.1.1](https://github.com/barzoj/somtoday-mcp/compare/v0.1.0...v0.1.1) (2026-10-20)


### Miscellaneous Chores

* **release:** drop release-as pin after 0.1.0 ([#43](https://github.com/barzoj/somtoday-mcp/issues/43)) ([8d7294c](https://github.com/barzoj/somtoday-mcp/commit/8d7294cd8620ced135bc1ed42a590414b247a189))

## [0.1.0](https://github.com/barzoj/somtoday-mcp/compare/v0.1.0...v0.1.0) (2026-10-20)


### Features

* **absence:** registrations overview and active measures ([#33](https://github.com/barzoj/somtoday-mcp/issues/33)) ([9c97b69](https://github.com/barzoj/somtoday-mcp/commit/9c97b694286de4bcfcee7bf199a1619f2ffa2add))
* **api:** Range paging, per-endpoint Accept, bodied 403 = not available ([#24](https://github.com/barzoj/somtoday-mcp/issues/24)) ([1b495ba](https://github.com/barzoj/somtoday-mcp/commit/1b495ba83ad737362c17bb911e7d395010f056f7))
* **assignments:** hand-in list with status and assignment_detail ([#26](https://github.com/barzoj/somtoday-mcp/issues/26)) ([9621ae7](https://github.com/barzoj/somtoday-mcp/commit/9621ae746146bd2f24c0b1aa826c8adf5235865f))
* **auth:** send the official OIDC claims parameter ([#22](https://github.com/barzoj/somtoday-mcp/issues/22)) ([e4b1eb0](https://github.com/barzoj/somtoday-mcp/commit/e4b1eb0ca52f2bae33bee3060e5737ec303ec0d3))
* **children, school_info, teachers:** profile, school data and staff ([#36](https://github.com/barzoj/somtoday-mcp/issues/36)) ([50399ce](https://github.com/barzoj/somtoday-mcp/commit/50399ceda2c7a8ccf2bb1e53b7652f87009f6f49))
* **download_attachment:** read allow-listed attachments with text extraction ([#38](https://github.com/barzoj/somtoday-mcp/issues/38)) ([5a364d3](https://github.com/barzoj/somtoday-mcp/commit/5a364d336c143408dab4684602bdf4b55f34c4b8))
* **exam_grades:** school-exam dossier overview ([#32](https://github.com/barzoj/somtoday-mcp/issues/32)) ([5c2cb6a](https://github.com/barzoj/somtoday-mcp/commit/5c2cb6ada6681833e0f35175e726a1f7b0d5e51e))
* **grades_latest:** newest results with limit and exam dossier ([#29](https://github.com/barzoj/somtoday-mcp/issues/29)) ([2621053](https://github.com/barzoj/somtoday-mcp/commit/2621053e7dec6b63eb19145e069ad9b33e22cd47))
* **grades_overview:** full grade overview per school year ([#30](https://github.com/barzoj/somtoday-mcp/issues/30)) ([9e527da](https://github.com/barzoj/somtoday-mcp/commit/9e527da93c329c57a6697faf982e56b5f9770e49))
* **homework:** full study planner for a date range, grouped by day ([#25](https://github.com/barzoj/somtoday-mcp/issues/25)) ([34476fe](https://github.com/barzoj/somtoday-mcp/commit/34476fe76d615f82df65ca5408541c68df5b46bf))
* **messages:** read-only conversations and threads ([#34](https://github.com/barzoj/somtoday-mcp/issues/34)) ([7e02145](https://github.com/barzoj/somtoday-mcp/commit/7e021455e3a2de3037aa541da484a0c769987dab))
* **news:** school news and Somtoday announcements ([#35](https://github.com/barzoj/somtoday-mcp/issues/35)) ([7c6672a](https://github.com/barzoj/somtoday-mcp/commit/7c6672a19f246166ab827060fe7f59b12f905b3f))
* **schedule:** timetable for a date range with changes, notes and holidays ([#28](https://github.com/barzoj/somtoday-mcp/issues/28)) ([0e19e61](https://github.com/barzoj/somtoday-mcp/commit/0e19e61530b11b7d1437ea6b13122ee77bda5eb0))
* **signing_requests, parent_evening, consents:** remaining portal reads ([#37](https://github.com/barzoj/somtoday-mcp/issues/37)) ([10ab836](https://github.com/barzoj/somtoday-mcp/commit/10ab836a3bfd2c0784a4c66c4723390f18af23ab))
* **study_material:** lesson material, year attachments, links and methods per subject ([#27](https://github.com/barzoj/somtoday-mcp/issues/27)) ([b71b4ac](https://github.com/barzoj/somtoday-mcp/commit/b71b4ac658562f48f846e54144f4c463d3a6360a))
* **subject_grades:** every column, definitions and composite parts for one subject ([#31](https://github.com/barzoj/somtoday-mcp/issues/31)) ([9c16ae6](https://github.com/barzoj/somtoday-mcp/commit/9c16ae67ed7e7e722e3047875510dea98134e9ea))


### Bug Fixes

* **auth:** lock and re-read before refresh, persist rotated tokens, add status/logout and auth_status ([#21](https://github.com/barzoj/somtoday-mcp/issues/21)) ([34006da](https://github.com/barzoj/somtoday-mcp/commit/34006da504e4fd93c3986d6571bb9e4c8482412c))
* **auth:** verified keychain writes over stdin and honest store errors ([#20](https://github.com/barzoj/somtoday-mcp/issues/20)) ([c13bb6d](https://github.com/barzoj/somtoday-mcp/commit/c13bb6db5126e1ab9de3ec4a3a802221dbd432f2))
* decode HTML entities once and strip nested tags in homework text ([#17](https://github.com/barzoj/somtoday-mcp/issues/17)) ([1818e86](https://github.com/barzoj/somtoday-mcp/commit/1818e86692909cb29f2f67ce57e437d8dc1d3609))
* generate unbiased PKCE verifiers and lint/format auth code ([#19](https://github.com/barzoj/somtoday-mcp/issues/19)) ([9bb9ee9](https://github.com/barzoj/somtoday-mcp/commit/9bb9ee9aa57583fe4d38cba3f58bce91462485d8))
* live-test findings (204, numeric ids, attachments, login browser) ([#39](https://github.com/barzoj/somtoday-mcp/issues/39)) ([b7596f5](https://github.com/barzoj/somtoday-mcp/commit/b7596f5dae8897e3bfa6d7a2329136b8b5def69e))
* **login:** use Somtoday's own school picker instead of a local school list ([#23](https://github.com/barzoj/somtoday-mcp/issues/23)) ([50dfeeb](https://github.com/barzoj/somtoday-mcp/commit/50dfeeb7e30b967a049bef4f53e55e7e564ae349))
* read the server version and User-Agent from package.json ([#11](https://github.com/barzoj/somtoday-mcp/issues/11)) ([7884b90](https://github.com/barzoj/somtoday-mcp/commit/7884b902d34b3af22d9c0067b78b7f1b46e131d2))
