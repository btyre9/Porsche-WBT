# Slide Sandbox

A lightweight environment for designing and testing slides before integrating them into a course module.

## Quick Start

1. **Open the viewer**: Open `sandbox/index.html` in your browser
2. **Select a slide**: Use the dropdown or click "Slides" to see the list
3. **Edit and refresh**: Make changes to slide HTML, then click "Refresh"

## Creating a New Slide

1. Copy `slides/_template.html` to a new file (e.g., `slides/my-slide.html`)
2. Edit the HTML/CSS/JS in your new file
3. Add it to the `slides` array in `index.html`:

```javascript
const slides = [
  { name: 'My New Slide', file: 'slides/my-slide.html' },
  // ...
];
```

4. Refresh the sandbox viewer

## Folder Structure

```
sandbox/
├── index.html              # Sandbox viewer (open in browser)
├── README.md               # This file
├── slides/                 # Your work-in-progress slides
│   ├── _template.html      # Starter template
│   └── circle-hub-test.html # Example slide
└── audio/                  # Test audio files
```

## Working with Assets

Slides in the sandbox can reference shared assets using relative paths:

```html
<!-- Icons -->
<img src="../../assets/icons/user.svg">

<!-- Fonts (in CSS) -->
src: url('../../assets/fonts/porsche-next-tt.ttf')

<!-- GSAP -->
<script src="../../assets/vendor/gsap/gsap.min.js"></script>
```

## Testing Audio

1. Add audio files to `sandbox/audio/`
2. Add them to the `audioFiles` array in `index.html`:

```javascript
const audioFiles = [
  { name: 'Slide 1 VO', file: 'audio/slide-01.mp3' },
];
```

3. Use the audio dropdown in the toolbar to play alongside your slide

## When Your Slide is Ready

1. **For prebuilt slides**: Copy the HTML file to `templates/slides/prebuilt/`
2. **For Jinja2 templates**: Convert hardcoded content to `{{ slide.xxx }}` variables
3. **For audio**: Move to `assets/audio/vo/` in your module project

## Tips

- **Slide dimensions**: Design for 1920x920px (the standard slide size)
- **Live editing**: Keep your editor and browser side by side
- **Use DevTools**: Right-click the slide iframe and "Inspect" to debug
- **Test interactions**: All click handlers, modals, etc. work in the sandbox
