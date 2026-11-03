// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// The lint guard that keeps MUI, Emotion and React Aria inside a template folder: the earlier
// component set's and the asf UI system's in the app.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

const restricted = async (code: string, filePath: string) => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports');
};

describe('the template boundary', { timeout: 30_000 }, () => {
  it('refuses MUI and Emotion in a page and in the set outside its template', async () => {
    const mui = "import Button from '@mui/material/Button';\nexport const B = Button;\n";
    expect(await restricted(mui, 'apps/web/src/features/home/Example.tsx')).toHaveLength(1);
    expect(await restricted(mui, 'packages/ui/src/components/Card/Example.tsx')).toHaveLength(1);
    const emotion = "import styled from '@emotion/styled';\nexport const s = styled;\n";
    expect(await restricted(emotion, 'apps/web/src/admin/Example.tsx')).toHaveLength(1);
  });

  it('refuses React Aria anywhere', async () => {
    const aria = "import { Button } from 'react-aria-components';\nexport const B = Button;\n";
    expect(await restricted(aria, 'apps/web/src/features/home/Example.tsx')).toHaveLength(1);
  });

  it('lets the template folder import MUI', async () => {
    const mui = "import Button from '@mui/material/Button';\nexport const B = Button;\n";
    expect(await restricted(mui, 'packages/ui/src/templates/mui/Example.tsx')).toHaveLength(0);
  });

  it("lets the asf template folder of the app import MUI, and still refuses the app's pages", async () => {
    const mui = "import Button from '@mui/material/Button';\nexport const B = Button;\n";
    expect(
      await restricted(mui, 'apps/web/src/ui/templates/asf/components/Example.tsx'),
    ).toHaveLength(0);
    expect(await restricted(mui, 'apps/web/src/ui/Example.tsx')).toHaveLength(1);
  });
});
