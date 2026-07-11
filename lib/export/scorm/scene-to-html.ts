/**
 * Best-effort HTML rendering of a scene's content for the SCORM couche-1
 * package. Reads `scenes.content` (JSONB) straight from Supabase, so inputs
 * cross a trust boundary — every field is narrowed at runtime instead of
 * trusted as the app's `SceneContent` union.
 *
 * Scope (couche 1): readable, self-contained text rendering — not the
 * pixel-perfect slide/PBL rendering the live app does (ProseMirror/ECharts/
 * canvas layout). `interactive` scenes are the exception: their `html` field
 * is already a complete standalone document fragment, reused as-is. Full
 * layout fidelity for slide/quiz/pbl is out of scope here; tracked for S1-008.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function renderQuizQuestion(question: unknown, index: number): string {
  if (!isRecord(question)) return '';
  const text = typeof question.question === 'string' ? question.question : '';
  const options = Array.isArray(question.options) ? question.options : [];
  const optionsHtml = options
    .map((option) => {
      if (!isRecord(option)) return '';
      const label = typeof option.label === 'string' ? option.label : '';
      return `<li>${escapeHtml(label)}</li>`;
    })
    .join('');
  return `<div class="scorm-quiz-question"><p><strong>${index + 1}.</strong> ${escapeHtml(text)}</p><ul>${optionsHtml}</ul></div>`;
}

function renderSlideElement(element: unknown): string {
  if (!isRecord(element)) return '';
  if (element.type === 'text' && typeof element.content === 'string') {
    // `content` is already HTML produced by the app's own slide editor
    // (ProseMirror), not external user input — safe to embed unescaped,
    // consistent with how the live slide renderer treats it.
    return `<div class="scorm-slide-text">${element.content}</div>`;
  }
  if (element.type === 'image' && typeof element.src === 'string') {
    return `<img class="scorm-slide-image" src="${escapeHtml(element.src)}" alt="" />`;
  }
  return '';
}

export function renderSceneContent(content: unknown): string {
  if (!isRecord(content)) return '';

  switch (content.type) {
    case 'interactive':
      return typeof content.html === 'string' ? content.html : '';

    case 'quiz': {
      const questions = Array.isArray(content.questions) ? content.questions : [];
      return questions.map((q, i) => renderQuizQuestion(q, i)).join('\n');
    }

    case 'slide': {
      const canvas = isRecord(content.canvas) ? content.canvas : undefined;
      const elements = Array.isArray(canvas?.elements) ? canvas.elements : [];
      return elements.map(renderSlideElement).filter(Boolean).join('\n');
    }

    case 'pbl': {
      const projectConfig = isRecord(content.projectConfig) ? content.projectConfig : undefined;
      const title = typeof projectConfig?.title === 'string' ? projectConfig.title : '';
      const description =
        typeof projectConfig?.description === 'string' ? projectConfig.description : '';
      return `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>`;
    }

    default:
      return '';
  }
}

export { escapeHtml };
