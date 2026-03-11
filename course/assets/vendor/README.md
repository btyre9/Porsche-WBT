# Local Vendor Assets (Offline SCORM)

Place third-party frontend libraries here so the course runs fully offline in LMS packages.

## Required Libraries

### GSAP
- `assets/vendor/gsap/gsap.min.js`

### Alpine.js
- `assets/vendor/alpine/alpine.min.js`

### Video.js
- `assets/vendor/video-js/video.min.js`
- `assets/vendor/video-js/video-js.min.css`
- `assets/vendor/video-js/font/*` (copy entire `font` folder from Video.js dist)

## Notes
- Prefer pinned versions and keep a changelog in commit messages.
- Do not rely on CDN links for SCORM delivery.
- Reference files with relative paths from slide HTML, for example:
  - `../assets/vendor/gsap/gsap.min.js`
  - `../assets/vendor/alpine/alpine.min.js`
  - `../assets/vendor/video-js/video.min.js`
  - `../assets/vendor/video-js/video-js.min.css`
