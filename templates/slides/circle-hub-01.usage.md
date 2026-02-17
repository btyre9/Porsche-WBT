# CircleHub Component Usage

A reusable interactive component with a center image surrounded by clickable circles that open modals.

## Basic Storyboard Example

```markdown
## SlideXX
Slide-ID: slide-xx
Template-ID: circle-hub-01
Slide-Title: Our Core Values
Audio-VO: assets/audio/slide-xx.mp3
Voiceover: Click each circle to learn more about our values.
Center-Image: ../assets/images/center-photo.png

Circle-1-Label: Team Building
Circle-1-Icon: user-group.svg
Circle-1-Position: 0
Circle-1-Headline: Team Building & Collaboration
Circle-1-Paragraph-1: Strong teams are built on trust and shared goals.
Circle-1-List-Title: Team Activities
Circle-1-List-Item-1: Quarterly workshops
Circle-1-List-Item-2: Cross-functional projects
Circle-1-List-Item-3: Mentorship programs

Circle-2-Label: Innovation
Circle-2-Icon: brain.svg
Circle-2-Position: 72
Circle-2-Headline: Innovation & Creativity
Circle-2-Paragraph-1: We encourage innovative thinking at all levels.
Circle-2-Image: ../assets/images/innovation.png

Circle-3-Label: Excellence
Circle-3-Icon: star.svg
Circle-3-Position: 144
Circle-3-Headline: Pursuit of Excellence
Circle-3-Paragraph-1: Excellence is achieved through dedication.

Circle-4-Label: Growth
Circle-4-Icon: chart.svg
Circle-4-Position: 216
Circle-4-Headline: Sustainable Growth
Circle-4-Paragraph-1: We pursue growth that is sustainable and ethical.

Circle-5-Label: Quality
Circle-5-Icon: check.svg
Circle-5-Position: 288
Circle-5-Headline: Quality Assurance
Circle-5-Paragraph-1: Quality is non-negotiable in everything we do.
```

## Field Reference

### Layout Configuration (Optional)

| Field | Default | Description |
|-------|---------|-------------|
| `Center-Size` | `240` | Diameter of center circle in pixels |
| `Outer-Size` | `100` | Diameter of each outer circle in pixels |
| `Radius` | `280` | Distance from center to outer circles in pixels |
| `Circle-Color` | `#d5001c` | Background color for outer circles (Porsche Red) |
| `Border-Color` | `#6b6d70` | Border color for circles |

### Center Circle

| Field | Required | Description |
|-------|----------|-------------|
| `Center-Image` | Yes | Path to center image (relative to build output) |

### Outer Circles (1-8)

Each circle uses a prefix like `Circle-1-`, `Circle-2-`, etc.

| Field | Required | Description |
|-------|----------|-------------|
| `Circle-X-Label` | Yes | Text label below the circle (also determines if circle exists) |
| `Circle-X-Icon` | No | Icon filename from `assets/icons/` (e.g., `user-group.svg`) |
| `Circle-X-Position` | No | Angle in degrees (0=top, 90=right, 180=bottom, 270=left). Default: evenly spaced |
| `Circle-X-Headline` | No | Modal title. Defaults to Label if not set |
| `Circle-X-Image` | No | Image to show in modal |
| `Circle-X-Paragraph-1` through `Paragraph-4` | No | Paragraphs of text in modal |
| `Circle-X-List-Title` | No | Title for bullet list |
| `Circle-X-List-Item-1` through `List-Item-8` | No | Bullet list items |

## Position Guide

Circles are positioned using angles in degrees:

```
            0° (top)
              |
    315°      |       45°
        \     |      /
          \   |    /
            \ |  /
270° (left) --+-- 90° (right)
            / |  \
          /   |    \
        /     |      \
    225°      |       135°
              |
          180° (bottom)
```

### Common Layouts

**3 circles (evenly spaced):**
- Position: 0, 120, 240

**4 circles (evenly spaced):**
- Position: 0, 90, 180, 270

**5 circles (evenly spaced):**
- Position: 0, 72, 144, 216, 288

**6 circles (evenly spaced):**
- Position: 0, 60, 120, 180, 240, 300

## Available Icons

Icons are located in `assets/icons/`. Common ones for this component:

- `user-group.svg` - Team/People
- `brain.svg` - Innovation/Thinking
- `star.svg` - Excellence/Quality
- `chart.svg` - Growth/Analytics
- `check.svg` - Quality/Completion
- `heart.svg` - Passion/Care
- `globe.svg` - Global/World
- `gift.svg` - Rewards/Benefits
- `key.svg` - Access/Security
- `flag.svg` - Goals/Milestones

See `assets/icons/` for the full list.

## Customization

### Custom Colors

```markdown
Circle-Color: #0066b3
Border-Color: #004d85
```

### Larger Layout

```markdown
Center-Size: 300
Outer-Size: 130
Radius: 340
```

### Smaller/Compact Layout

```markdown
Center-Size: 180
Outer-Size: 80
Radius: 220
```
