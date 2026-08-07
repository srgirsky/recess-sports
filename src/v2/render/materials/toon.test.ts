import { describe, expect, it } from 'vitest';
import { makeToonMaterial, setFaceCell } from './toon';

describe('face atlas state', () => {
  it('keeps an expression set before the shader compiles', () => {
    const material = makeToonMaterial();
    const surprised = [0.25, 0.5, 0.25, 0.25] as const;
    setFaceCell(material, surprised);
    expect(material.userData.faceCell).toEqual([...surprised]);
    material.dispose();
  });

  it('updates the compiled uniform and the precompile fallback together', () => {
    const material = makeToonMaterial();
    const uniform = { value: [0, 0.75, 0.25, 0.25] };
    material.userData.shader = { uniforms: { uFaceCell: uniform } };
    const grin = [0.25, 0.75, 0.25, 0.25] as const;
    setFaceCell(material, grin);
    expect(uniform.value).toEqual([...grin]);
    expect(material.userData.faceCell).toEqual([...grin]);
    material.dispose();
  });
});
