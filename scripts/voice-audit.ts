/**
 * Audits the voiceover of a generated course: speech lines with and without audio per scene,
 * vocal casting, server voice providers. Read-only.
 *
 *   tsx scripts/voice-audit.ts <stageId>
 *
 * Exit code 1 when at least one speech line has no audio (the MP4 and LMS exports refuse it).
 */
import { ClassroomCastingError, normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
import { getServerTTSProviders } from '@/lib/server/provider-config';
import { readClassroom } from '@/lib/server/classroom-storage';
import { summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';

async function main(): Promise<void> {
  const stageId = process.argv[2];
  if (!stageId) {
    console.error('Usage: tsx scripts/voice-audit.ts <stageId>');
    process.exit(2);
  }
  const classroom = await readClassroom(stageId);
  if (!classroom) {
    console.error(`Classroom ${stageId} not found`);
    process.exit(2);
  }

  const report = summarizeSpeechAudio(classroom.scenes);
  for (const scene of report.scenes) {
    console.log(
      `scene ${scene.order} | ${scene.speech} speech | ${scene.missing} without audio${scene.missing > 0 ? ' <-' : ''}`,
    );
  }
  console.log(`TOTAL ${report.speech} speech, ${report.missing} without audio`);

  try {
    const casting = normalizeClassroomCasting(classroom.stage, classroom.scenes);
    console.log(casting ? `casting: ${casting.agents.length} agent(s)` : 'casting: NONE');
  } catch (error) {
    console.log(
      `casting: INVALID (${error instanceof ClassroomCastingError ? error.message : String(error)})`,
    );
  }
  const providers = Object.entries(getServerTTSProviders()).map(
    ([id, info]) => `${id}${info.disabled ? ' (disabled)' : ''}`,
  );
  console.log(`server TTS providers: ${providers.join(', ') || 'NONE'}`);
  process.exit(report.missing > 0 ? 1 : 0);
}

void main();
