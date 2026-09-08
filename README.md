# KnowTI: Bridging the Knowledge Gap in Information Communication through Interactive Visual LLM Summarizations 

Overview on the supplementary material provided:

- **1_framework** (to run the frameworks or example-viewer, navigate to the respective folder and run the following commands: `npm install` and `npm run dev`)
  - **1.1_knowti-framework** — the code of our framework with the two video examples used in the user study (skeleton generated through Claude Sonnet 4)
  - **1.2 example-viewer** — to facilitate the investigation of the outcome of additional use cases (viewer generated through Claude Sonnet 5):
    - **llm-comparison** (view 1-11) — different LLMs and models with the same input prompt
    - **course-examples** (view 12-17) — testing our approach on a course recording
    - **interface-examples** (view 18-20) — using different components of a screenshot of a Visual Analytics interface as an input
    - **examples-of-different-domains** — extended examples of different domains, such as mathematics, theoretical informatics, history, philosophy, etc.
  - **1.3 content-editing-framework** — a framework to help content creators generate interactive examples by running a simplified version of all template prompts and presenting users the intermediate outcomes for approval and editing (vibe-coded with Claude Sonnet 4.6)
  - **1.4 prompts** — the prompts used for our framework (analysis of the transcript supported by ChatGPT GPT 4; React components and skeleton generated through Claude Sonnet 4)

- **2_llm-comparison:**
  - contains all input prompts used for comparing different LLMs, as well as the generated outputs and the rubric-based assessment protocol

- **3_user study**
  - **1_coding-of-utterances.xlsx** — the coding process of the utterances (translated from the language of the participants to English through ChatGPT GPT 5)
  - **2_statistical-significance.xslsx** — the statistical tests performed for significance
  - **3_study-questions.xlsx** — the questions, answer options, and scales of all study questionnaires
  - **4_study-answers.xlsx** — the answers of all participants on the study questionnaires
  - **5_demographic-data-pdf** — demographic data of study participants
  - **6_knowledge-vs-confidence.pdf** — a scatterplot of knowledge vs. confidence scores at the three knowledge assessments

- **4_video**
  - **knowti-video_(elevenlabs.io).mp4** — a video demonstrating our approach (audio voice from elevenlabs.io)
