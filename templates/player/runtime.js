(function () {
  function $(id) { return document.getElementById(id); }

  function shuffle(arr) {
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pct(correct, total) {
    if (!total) return 0;
    return Math.round((correct / total) * 10000) / 100;
  }

  function findApi(win) {
    let w = win;
    while (w) {
      if (w.API_1484_11) return { api: w.API_1484_11, version: "2004" };
      if (w.API) return { api: w.API, version: "1.2" };
      if (w === w.parent) break;
      w = w.parent;
    }
    return null;
  }

  const scorm = {
    api: null,
    version: null,
    init() {
      const found = findApi(window);
      if (!found) return false;
      this.api = found.api;
      this.version = found.version;
      try {
        return this.version === "2004" ? this.api.Initialize("") === "true" : this.api.LMSInitialize("") === "true";
      } catch (_e) { return false; }
    },
    setValue(key, value) {
      if (!this.api) return false;
      try {
        return this.version === "2004" ? this.api.SetValue(key, String(value)) === "true" : this.api.LMSSetValue(key, String(value)) === "true";
      } catch (_e) { return false; }
    },
    commit() {
      if (!this.api) return false;
      try {
        return this.version === "2004" ? this.api.Commit("") === "true" : this.api.LMSCommit("") === "true";
      } catch (_e) { return false; }
    },
    terminate() {
      if (!this.api) return false;
      try {
        return this.version === "2004" ? this.api.Terminate("") === "true" : this.api.LMSFinish("") === "true";
      } catch (_e) { return false; }
    },
    reportFinal(scorePercent, threshold) {
      if (!this.api) return false;
      const passed = Number(scorePercent) >= Number(threshold);
      if (this.version === "2004") {
        this.setValue("cmi.score.min", 0);
        this.setValue("cmi.score.max", 100);
        this.setValue("cmi.score.raw", scorePercent);
        this.setValue("cmi.success_status", passed ? "passed" : "failed");
        this.setValue("cmi.completion_status", "completed");
      } else {
        this.setValue("cmi.core.score.min", 0);
        this.setValue("cmi.core.score.max", 100);
        this.setValue("cmi.core.score.raw", scorePercent);
        this.setValue("cmi.core.lesson_status", passed ? "passed" : "failed");
      }
      this.commit();
      return true;
    }
  };

  const state = {
    data: null,
    slideIndex: 0,
    quizMode: null,
    questions: [],
    qIndex: 0,
    finalCorrect: 0,
    finalAnswered: 0,
    sfx: { correct: null, incorrect: null }
  };

  function playSfx(kind) {
    const a = state.sfx[kind];
    if (!a) return;
    try { a.currentTime = 0; a.play(); } catch (_e) {}
  }

  function showSlide(i) {
    const slides = state.data.slides || [];
    if (!slides.length) return;
    state.slideIndex = (i + slides.length) % slides.length;
    $("slide-frame").src = "../slides/" + slides[state.slideIndex].id + ".html";
    $("slide-counter").textContent = (state.slideIndex + 1) + "/" + slides.length;
  }

  function loadQuestion() {
    const q = state.questions[state.qIndex];
    if (!q) return;

    $("quiz-progress").textContent = "Question " + (state.qIndex + 1) + " of " + state.questions.length;
    $("quiz-question").textContent = q.question || "";
    $("feedback").textContent = "";

    const choices = q._shuffled || shuffle(q.choices || []);
    q._shuffled = choices;

    const form = $("quiz-form");
    form.innerHTML = "";
    choices.forEach((c, idx) => {
      const id = "choice-" + idx;
      const row = document.createElement("label");
      row.className = "choice";
      row.innerHTML = '<input type="radio" name="quiz-choice" value="' + c.replace(/"/g, '&quot;') + '" id="' + id + '"> ' + c;
      form.appendChild(row);
    });
  }

  function openQuiz(mode) {
    state.quizMode = mode;
    state.qIndex = 0;
    state.finalCorrect = 0;
    state.finalAnswered = 0;

    state.questions = mode === "final"
      ? (state.data.quiz?.final_quiz?.questions || []).map((q) => ({ ...q }))
      : (state.data.quiz?.knowledge_checks || []).map((q) => ({ ...q }));

    $("quiz-title").textContent = mode === "final" ? "Final Quiz" : "Knowledge Checks";
    $("quiz-panel").classList.remove("hidden");
    $("btn-next-question").disabled = mode === "final";

    if (!state.questions.length) {
      $("quiz-progress").textContent = "";
      $("quiz-question").textContent = "No questions found.";
      $("quiz-form").innerHTML = "";
      return;
    }

    state.questions.forEach((q) => {
      if (q.shuffle_answers !== false) q._shuffled = shuffle(q.choices || []);
    });

    loadQuestion();
  }

  function selectedAnswer() {
    const checked = document.querySelector('input[name="quiz-choice"]:checked');
    return checked ? checked.value : null;
  }

  function onSubmitAnswer() {
    const q = state.questions[state.qIndex];
    if (!q) return;
    const answer = selectedAnswer();
    if (!answer) {
      $("feedback").textContent = "Select an answer.";
      return;
    }

    const correct = String(answer).trim() === String(q.correct_answer || "").trim();

    if (state.quizMode === "knowledge") {
      $("feedback").textContent = correct
        ? "Correct! Click Next to Continue."
        : "Incorrect, let's go back to review";
      playSfx(correct ? "correct" : "incorrect");
    } else {
      state.finalAnswered += 1;
      if (correct) state.finalCorrect += 1;

      // Final quiz: no correctness feedback; submit advances immediately.
      $("feedback").textContent = "";
      if (state.qIndex < state.questions.length - 1) {
        state.qIndex += 1;
        loadQuestion();
        return;
      }

      const score = pct(state.finalCorrect, state.questions.length);
      const threshold = Number(state.data.quiz?.final_quiz?.passing_score ?? 80);
      $("quiz-progress").textContent = "Final score: " + score + "% (pass: " + threshold + "%)";
      $("quiz-question").textContent = score >= threshold ? "Passed." : "Not passed.";
      $("quiz-form").innerHTML = "";
      window.CourseRuntime.submitFinalQuiz(score);
    }
  }

  function onNextQuestion() {
    if (!state.questions.length) return;
    if (state.quizMode === "final") return;

    if (state.quizMode === "knowledge") {
      if (state.qIndex < state.questions.length - 1) {
        state.qIndex += 1;
        loadQuestion();
        return;
      }
      $("feedback").textContent = "Knowledge checks complete.";
      return;
    }

  }

  async function init() {
    scorm.init();
    window.addEventListener("beforeunload", () => { scorm.terminate(); });

    const res = await fetch("../data/course.data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load course.data.json");
    state.data = await res.json();

    $("course-title").textContent = state.data.meta?.title || "Course";

    const c = state.data.quiz?.runtime?.sfx;
    if (c?.correct) state.sfx.correct = new Audio("../" + c.correct);
    if (c?.incorrect) state.sfx.incorrect = new Audio("../" + c.incorrect);

    $("btn-prev").addEventListener("click", () => showSlide(state.slideIndex - 1));
    $("btn-next").addEventListener("click", () => showSlide(state.slideIndex + 1));
    $("btn-open-kc").addEventListener("click", () => openQuiz("knowledge"));
    $("btn-open-final").addEventListener("click", () => openQuiz("final"));
    $("btn-close-quiz").addEventListener("click", () => $("quiz-panel").classList.add("hidden"));
    $("btn-submit-answer").addEventListener("click", onSubmitAnswer);
    $("btn-next-question").addEventListener("click", onNextQuestion);

    window.CourseRuntime = {
      submitFinalQuiz(scorePercent) {
        const threshold = Number(state.data.quiz?.final_quiz?.passing_score ?? 80);
        scorm.reportFinal(scorePercent, threshold);
      }
    };

    showSlide(0);
  }

  init().catch((e) => {
    console.error(e);
    document.body.innerHTML = "<pre>Player init failed. See console.</pre>";
  });
})();
