import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Color, Group, SRGBColorSpace, NeutralToneMapping, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { ROSTER } from '../../data/characters';
import { createCharacter } from './CharacterFactory';
import { characterPortrait, configureCharacterPortraits } from './characterPortrait';

vi.mock('./CharacterFactory', () => ({ createCharacter: vi.fn(), proxyForced: () => false }));
vi.mock('./proceduralClips', () => ({ buildProceduralClips: () => [] }));
vi.mock('./AnimationDirector', () => ({ AnimationDirector: class {
  play() {} update() {} dispose() {}
} }));

function gpu() {
  const initial = {} as WebGLRenderTarget;
  let current = initial;
  const color = new Color(0x123456);
  let alpha = .75;
  const gl = {
    autoClear: false,
    outputColorSpace: SRGBColorSpace,
    toneMapping: NeutralToneMapping,
    toneMappingExposure: 1.25,
    getRenderTarget: () => current,
    setRenderTarget: (target: WebGLRenderTarget) => { current = target; },
    getClearColor: (out: Color) => out.copy(color),
    setClearColor: (value: Color | number, nextAlpha: number) => { color.set(value); alpha = nextAlpha; },
    getClearAlpha: () => alpha,
    render: vi.fn(),
    readRenderTargetPixels: vi.fn(),
  };
  return { gl, initial, color: color.clone() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createCharacter).mockImplementation(async () => ({
    source: 'model',
    view: { root: new Group(), mesh: new Group(), heightFt: 4,
      setFacing: vi.fn(), dispose: vi.fn() } as never,
  }));
  vi.stubGlobal('document', { createElement: () => ({
    getContext: () => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: vi.fn(),
    }),
    toDataURL: () => 'data:image/png;base64,portrait',
  }) });
});

afterEach(() => vi.unstubAllGlobals());

describe('runtime portraits leave the live renderer intact', () => {
  it('caches a repeated kit but refreshes an edited custom appearance', async () => {
    const { gl, initial, color } = gpu();
    configureCharacterPortraits(gl as unknown as WebGLRenderer);
    const first = characterPortrait(ROSTER[0]);
    expect(characterPortrait(ROSTER[0])).toBe(first);
    await first;
    await characterPortrait({ ...ROSTER[0], visual: { ...ROSTER[0].visual, uniform: ROSTER[0].visual.uniform + 1 } });
    expect(createCharacter).toHaveBeenCalledTimes(2);
    expect(gl.getRenderTarget()).toBe(initial);
    expect(gl.getClearColor(new Color()).equals(color)).toBe(true);
    expect(gl.getClearAlpha()).toBe(.75);
    expect(gl.autoClear).toBe(false);
  });

  it('restores the GPU and releases the clone after a failed readback, then permits retry', async () => {
    const { gl, initial, color } = gpu();
    gl.readRenderTargetPixels.mockImplementationOnce(() => { throw new Error('readback failed'); });
    configureCharacterPortraits(gl as unknown as WebGLRenderer);
    await expect(characterPortrait(ROSTER[0])).rejects.toThrow('readback failed');
    const failed = await vi.mocked(createCharacter).mock.results[0].value;
    expect(failed.view.dispose).toHaveBeenCalledOnce();
    expect(gl.getRenderTarget()).toBe(initial);
    expect(gl.getClearColor(new Color()).equals(color)).toBe(true);
    expect(gl.getClearAlpha()).toBe(.75);
    expect(gl.autoClear).toBe(false);
    await expect(characterPortrait(ROSTER[0])).resolves.toContain('data:image/png');
    expect(createCharacter).toHaveBeenCalledTimes(2);
  });
});
