# CircleHub Component Usage

Interactive component with a center image surrounded by clickable circles that open modals.

## Storyboard Example

```markdown
## SlideXX
Slide-ID: slide-xx
Template-ID: circle-hub-01
Slide-Title: Our Core Values
Audio-VO: assets/audio/slide-xx.mp3
Voiceover: Click each circle to learn more about our values.
Center-Image: ../assets/images/center-photo.png
Radius: 320

Circle-1-Label: Customer Relations
Circle-1-Icon: user.svg
Circle-1-Position: 0
Circle-1-Headline: Customer Relations Excellence
Circle-1-Paragraph-1: Building lasting relationships with every interaction.
Circle-1-List-Title: Key Behaviors
Circle-1-List-Item-1: Active listening
Circle-1-List-Item-2: Personalized service
Circle-1-List-Item-3: Proactive communication

Circle-2-Label: Brand Excellence
Circle-2-Icon: star.svg
Circle-2-Position: 72
Circle-2-Headline: Brand Excellence
Circle-2-Paragraph-1: Upholding the Porsche standard in everything we do.

Circle-3-Label: Technical Mastery
Circle-3-Icon: wrench.svg
Circle-3-Position: 144
Circle-3-Headline: Technical Mastery
Circle-3-Paragraph-1: World-class expertise and precision.

Circle-4-Label: Innovation
Circle-4-Icon: brain.svg
Circle-4-Position: 216
Circle-4-Headline: Innovation & Growth
Circle-4-Paragraph-1: Embracing new technologies and methods.

Circle-5-Label: Quality
Circle-5-Icon: check.svg
Circle-5-Position: 288
Circle-5-Headline: Uncompromising Quality
Circle-5-Paragraph-1: Excellence in every detail.
```

## Field Reference

### Layout

| Field | Default | Description |
|-------|---------|-------------|
| `Center-Image` | - | Path to center circle image |
| `Radius` | `320` | Distance from center to outer circles (px) |

### Circles (1-8)

| Field | Required | Description |
|-------|----------|-------------|
| `Circle-X-Label` | Yes | Label below circle (determines if circle exists) |
| `Circle-X-Icon` | No | Icon from `assets/icons/` |
| `Circle-X-Position` | No | Angle in degrees (0=top, 90=right, 180=bottom, 270=left) |
| `Circle-X-Headline` | No | Modal title (defaults to Label) |
| `Circle-X-Image` | No | Image in modal |
| `Circle-X-Paragraph-1` to `4` | No | Text paragraphs |
| `Circle-X-List-Title` | No | Bullet list heading |
| `Circle-X-List-Item-1` to `8` | No | Bullet list items |

## Position Guide

```
            0° (top)
              |
    315°      |       45°
        \     |      /
          \   |    /
270° -------+------- 90°
          /   |    \
        /     |      \
    225°      |       135°
              |
          180° (bottom)
```

### Common Layouts

- **5 circles**: 0, 72, 144, 216, 288
- **4 circles**: 0, 90, 180, 270
- **3 circles**: 0, 120, 240
- **6 circles**: 0, 60, 120, 180, 240, 300
