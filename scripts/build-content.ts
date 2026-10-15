import { Glob } from 'bun';
import { Effect } from 'effect';
import { assembleContent } from '../src/content/assemble';
import type { ContentFile } from '../src/content/assemble';
import { ContentError } from '../src/content/validate';

const CONTENT_DIR = 'content';
const OUTPUT = 'public/content.json';

const readFiles = Effect.fn('readFiles')(function* (): Effect.fn.Return<ReadonlyArray<ContentFile>, ContentError> {
  const paths = Array.from(new Glob('**/*.{yaml,yml}').scanSync({ cwd: CONTENT_DIR }));
  return yield* Effect.forEach(paths, (path) =>
    Effect.tryPromise({
      try: async (): Promise<ContentFile> => ({ path, text: await Bun.file(`${CONTENT_DIR}/${path}`).text() }),
      catch: (error) => new ContentError({ problems: [`${path}: ${String(error)}`] }),
    }),
  );
});

const program = Effect.gen(function* () {
  const files = yield* readFiles();
  const content = yield* assembleContent(files);
  yield* Effect.promise(() => Bun.write(OUTPUT, JSON.stringify(content)));
  console.log(
    `${OUTPUT}: ${content.movements.length} movements, ${content.drills.length} drills, ${content.tasks.length} tasks, ${content.exercises.length} exercises`,
  );
});

if (import.meta.main) {
  await Effect.runPromise(
    program.pipe(
      Effect.catchTag('ContentError', (error) =>
        Effect.sync(() => {
          console.error(`Content is invalid (${error.problems.length} problems):`);
          for (const problem of error.problems) console.error(`- ${problem}`);
          process.exitCode = 1;
        }),
      ),
    ),
  );
}
