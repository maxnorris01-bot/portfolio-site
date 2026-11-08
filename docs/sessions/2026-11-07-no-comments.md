# ShopAI: no comments; Share list Text on computers (2026-11-08)

Branch: feat/no-comments (not pushed). Front end only: the backend and api-contract are untouched (the backend treats `comment` as optional).

## Removed
- The comment popover, the "Add a comment" / "Comment saved" link and the reserved line under the rating buttons (`ShopView.tsx`, `Shop.css`). Cards are now 8 subgrid rows (was 9). Rating never opens anything; click again still clears.
- `src/shop/commentpop.ts` and `tests/shopcommentpop.test.ts`.
- The comment plumbing: `setComment`, `commentBlur`, the `comment` rating action, `COMMENT_MAX`, `comment` and `savedComment` on `ItemRating`, `onComment` / `onCommentBlur` props, fixture comment values. `POST /rate` now sends `{session_id, result_id, rating}` only; a failed save retries the rating.
- Share list: the "Your note:" line (text, email, print) and the "Your comment" CSV column (8 columns now); the count line says "links, prices and stores." `shareItems` no longer takes the ratings.
- Copy: the README line and the Résumé ShopAI bullet no longer say "comments".

## Left on purpose
- `RatingEntry.comment?` is still an optional field, so an old session's reply parses; it is ignored (never stored, shown or sent). Three doc comments say so.
- The failed-save message ("Could not save." + Retry) stays, now under the rating buttons.
- The Résumé PDF in `public/` was not edited and may still say "ratings and comments".

## Part B: Text on computers
- `share.ts`: `smsUrl(phone, body?)` (no body gives `sms:<number>` or `sms:`), `isPhoneOrTablet(userAgent, mobileHint)`, `textOnComputer(...)` (copy first, then open), and the hint and note texts.
- `ShareModal.tsx`: phones and tablets keep the `sms:` link with the body. Computers copy the same short text (same "N more not shown" rule, `SMS_LIMIT` kept), open `sms:<number>` with no body, and show "List copied. Paste it into the message (Cmd+V on Mac, Ctrl+V on Windows)." If the copy fails it says so and shows the text in a box, selected, to copy by hand. The app opens either way.
- The hint under Text is "Copies the list, then opens your messaging app. Paste it in." on computers; phones unchanged.
- Detection: `navigator.userAgentData?.mobile === true`, or a user agent with iPhone, iPad or Android. An iPad that reports a Mac user agent is treated as a computer (copy, then open).

## Checks
`tsc`, `eslint`, `build` clean; full suite 737 pass, 0 fail. Headless screenshots of /shop (`?fixture=askcards`) at 1440x900 and 390x844, and the Share modal at 1440x900.
