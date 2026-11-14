import { describe, expect, it } from "vitest";
import { separate, type ObjCell } from "../src/objects";

const block = (x: number, y: number): ObjCell[] => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];

describe("separate", () => {
  it("keeps cells two apart together and three apart apart", () => {
    expect(separate([...block(0, 0), ...block(4, 0)])).toHaveLength(2);
    expect(separate([...block(0, 0), ...block(3, 0)])).toHaveLength(1);
    expect(separate([...block(0, 0), ...block(3, 3)])).toHaveLength(1);
    expect(separate([...block(0, 0), ...block(4, 4)])).toHaveLength(2);
  });

  it("gives each object its cells and its box", () => {
    const [a, b] = separate([...block(-10, -10), ...block(20, 5)]).sort((p, q) => p.x0 - q.x0);
    expect(a).toMatchObject({ x0: -10, y0: -10, x1: -9, y1: -9 });
    expect(b.cells).toHaveLength(4);
    expect(b).toMatchObject({ x0: 20, y0: 5, x1: 21, y1: 6 });
  });

  it("joins a chain whatever the order its cells come in", () => {
    const chain: ObjCell[] = Array.from({ length: 200 }, (_, i) => [i * 2, (i * 7) % 3]);
    expect(separate(chain.slice().reverse())).toHaveLength(1);
    expect(separate(chain)).toHaveLength(1);
  });
});
