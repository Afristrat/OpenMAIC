/**
 * Best-effort HTML rendering of a scene's content for the SCORM couche-1
 * package. Reads `scenes.content` (JSONB) straight from Supabase, so inputs
 * cross a trust boundary — every field is narrowed at runtime instead of
 * trusted as the app's `SceneContent` union.
 *
 * This is an accessible transcript next to the package's static scene image.
 * It never embeds the live Qalem runtime or executable widget HTML: an LMS
 * export must remain honest about being a static representation.
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
    const text = element.content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? `<p>${escapeHtml(text)}</p>` : '';
  }
  return '';
}

export function renderSceneContent(
  content: unknown,
  options: { staticWidgetNotice?: string } = {},
): string {
  if (!isRecord(content)) return '';

  switch (content.type) {
    case 'interactive':
      return `<p class="scorm-scene-transcript">${escapeHtml(
        options.staticWidgetNotice ?? 'Widget présenté sous forme de capture statique.',
      )}</p>`;

    case 'plugin':
      if (content.pluginType !== 'published-widget' || !isRecord(content.data)) return '';
      return `<p class="scorm-scene-transcript" data-static-widget="true">${escapeHtml(
        options.staticWidgetNotice ?? 'Widget présenté sous forme de capture statique.',
      )}</p>`;

    case 'quiz': {
      const questions = Array.isArray(content.questions) ? content.questions : [];
      return `<div class="scorm-scene-transcript">${questions.map((q, i) => renderQuizQuestion(q, i)).join('\n')}</div>`;
    }

    case 'slide': {
      const canvas = isRecord(content.canvas) ? content.canvas : undefined;
      const elements = Array.isArray(canvas?.elements) ? canvas.elements : [];
      return `<div class="scorm-scene-transcript">${elements.map(renderSlideElement).filter(Boolean).join('\n')}</div>`;
    }

    case 'pbl': {
      const projectConfig = isRecord(content.projectConfig) ? content.projectConfig : undefined;
      const title = typeof projectConfig?.title === 'string' ? projectConfig.title : '';
      const description =
        typeof projectConfig?.description === 'string' ? projectConfig.description : '';
      return `<div class="scorm-scene-transcript"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
    }

    default:
      return '';
  }
}

export { escapeHtml };
