## Description

<!-- What does this PR do? Be direct and concise. -->

## Related Issue

<!-- Link the issue: Closes #123 or Fixes #123. Every PR should address an issue. -->

Closes #

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Refactor (code change that neither fixes a bug nor adds a feature)
- [ ] Documentation update
- [ ] Breaking change (fix or feature that would cause existing functionality to change)

## Changes Made

<!-- List specific changes. Be concrete. -->

-
-
-

## Testing

<!-- How did you verify this works? Check all that apply. -->

- [ ] Tested on Chrome (version: ___)
- [ ] Extension loads without errors on `chrome://extensions`
- [ ] Tested detection on a free itch.io game page (URL: ___)
- [ ] Tested detection on a paid itch.io game page
- [ ] Tested on a non-game itch.io page (should not detect)
- [ ] Tested queue add / remove / edit operations
- [ ] Tested push to GitHub with `url_only` format
- [ ] Tested push to GitHub with `full_object` format
- [ ] Tested with GPG signing enabled
- [ ] Tested with GPG signing disabled
- [ ] No console errors in service worker
- [ ] No console errors in popup / queue / settings pages
- [ ] NSFW detection works on content-warned pages

## Screenshots (if applicable)

<!-- Attach screenshots for any UI changes. Delete this section if not applicable. -->

## Checklist

- [ ] My code follows the project's [code style](CONTRIBUTING.md#code-style)
- [ ] I have not added any new dependencies
- [ ] All imports are static (no `await import()` in service worker)
- [ ] I used `textContent` (not `innerHTML`) for dynamic DOM content
- [ ] I have added comments where the logic is non-obvious
- [ ] I have updated documentation if my changes affect user-facing behavior
- [ ] I have tested my changes thoroughly before submitting
