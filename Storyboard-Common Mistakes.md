 1. Multi-line values
     Bad:
  Voiceover: This is line one.

  Good:


  2. Missing ## slide heading

  Template-ID: content-standard-01
  Good:
  Slide-ID: slide-MOD01_SLD_001

     Bad:
  Slide Title: Intro
  Good:


  Animation-Intro: ZoomLeft
  Good:

  Animation-Intro: FadeIn
  (Allowed: FadeIn, SlideUp, ScaleIn)
  5. Using Image: without a real path
     Bad:
  Image: Technician talking to customer in service bay
  Good:
  Image-Description: Technician talking to customer in service bay
  Then later in production:
  Image: assets/images/MOD01_SLD_001_hero.webp

     Bad:



  Image-Description: TBD hero image for this slide
  (or omit image keys entirely)

     Bad:

  Correct-Answer: Explain clearly.
  Good:

  Choice-1: Explain clearly and confirm next steps.
  Correct-Answer: Explain clearly and confirm next steps.

  8. Forgetting quiz fields

  Interaction-Type: mcq

  Good:
  Interaction-Type: mcq
  Quiz-Group: knowledge
  Choice-1: Option A
  Correct-Answer: Option A

     Bad:

  Slide-ID: slide-MOD01_SLD_001

  Slide-ID: slide-MOD01_SLD_001
  Good:

  ## Slide01

  ## Slide02

  10. Using paths that are not project-relative


  Good:

     Bad:
  Voiceover: You will follow a structured handoff process.

  Good:

  Voiceover: You will follow a structured handoff process.
  Voiceover: You will follow a structured handoff process.
  Caption-Text: You will follow a structured handoff process.

  12. Wrong template ID
     Bad:
  ? for shortcuts                                                                                                 62% context left  

  ? for shortcuts                                                                                                                                                                                      62% context left

  Good:

  Template-ID: content-standard-01

  (Use only mapped IDs in config/template-map.json