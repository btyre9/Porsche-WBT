 1. Create a new file in storyboard/ (example: storyboard/course.authoring.md).

  # Course: <Course Name>

  3. Create each slide as a section with ##:

  ## Slide02
  ## Slide03
  4. Inside each slide, use only single-line Key: Value entries.
     Do not use paragraphs or multi-line values.

  Template-ID: <template-id>
  Voiceover: <approved script text>

  6. If you do not have asset paths yet, do not use Image: or Audio-VO:.
     Use planning keys instead:
  Image-Description: <what image should show>

  7. For content text shown on screen, add:

  On-Screen-Text: <on-screen copy>

  8. For animations, use only:

  Animation-Intro: FadeIn

  or SlideUp or ScaleIn.


  Interaction-Type: mcq
  Quiz-Group: knowledge
  Question: <question text>
  Choice-1: <answer option>
  Choice-2: <answer option>
  Choice-3: <answer option>
  Correct-Answer: <must exactly match one Choice value>

  Use Quiz-Group: final for final quiz questions.

  10. Save and hand off. Production can later add real paths:

  Image: assets/images/<file>.webp                                                                                                                                                                                       
  Audio-VO: assets/audio/vo/<file>.mp3                                                                                                                                                                                   
  ———

  Copy/Paste Starter Template

  # Course: <Course Name>

  ## Slide01
  Slide-ID: slide-MOD01_SLD_001
  Template-ID: title-intro-01
  Slide-Title: <Title>
  Subtitle: <Subtitle>
  Animation-Intro: FadeIn
  Image-Description: <image concept>
  Audio-Notes: <vo notes>

  ## Slide02
  Slide-ID: slide-MOD01_SLD_002
  Template-ID: content-standard-01
  Voiceover: <approved script>

  ## Slide03
  Slide-ID: slide-MOD01_SLD_003
  Template-ID: learning-objectives-01
  Subtitle: By the end of this module, you will be able to:
  Objective-1: <objective>
  Objective-2: <objective>
  Objective-3: <objective>
  Voiceover: <approved script>
  Caption-Text: <approved script>
  Animation-Intro: SlideUp

  ## Slide04
  Slide-Title: Knowledge Check
  On-Screen-Text: Choose the best response.
  Interaction-Type: mcq
  Question: <question>
  Choice-3: <choice>
  Correct-Answer: <exact matching choice text>
  Voiceover: <approved script>
  Animation-Intro: ScaleIn

  ## Slide05
  Slide-ID: slide-MOD01_QUIZ_001
  Template-ID: kc-mcq-01
  Slide-Title: Final Quiz Question
  On-Screen-Text: Select one answer.
  Interaction-Type: mcq
  Quiz-Group: final
  Question: <question>
  Choice-1: <choice>
  Choice-2: <choice>
  Choice-3: <choice>
  Correct-Answer: <exact matching choice text>                                                                                                                                                                           
  Voiceover: <approved script>                                                                                                                                                                                           
  Caption-Text: <approved script>                                                                                                                                                                                        
  Animation-Intro: FadeIn                                                                                                                                                                                                
                                 