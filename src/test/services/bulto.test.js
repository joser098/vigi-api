const { buildPackages, BultoError } = require("../../services/bulto");

const camara = { id: "cam", weight_grams: 800, height_cm: 12, width_cm: 15, length_cm: 20 };
const kit = { id: "kit", weight_grams: 18000, height_cm: 30, width_cm: 40, length_cm: 50 };

describe("buildPackages", () => {
  test("un producto: sus medidas, acostado sobre la cara más grande", () => {
    expect(buildPackages([{ id: "cam", quantity: 1 }], [camara])).toEqual([
      { weight: 800, length: 20, width: 15, height: 12 },
    ]);
  });

  test("varias unidades se apilan: alto suma, largo y ancho son el máximo", () => {
    expect(buildPackages([{ id: "cam", quantity: 3 }], [camara])).toEqual([
      { weight: 2400, length: 20, width: 15, height: 36 },
    ]);
  });

  test("pasados los 25 kg se abre otro bulto", () => {
    const packages = buildPackages(
      [{ id: "kit", quantity: 2 }, { id: "cam", quantity: 1 }],
      [kit, camara]
    );

    expect(packages).toHaveLength(2);
    expect(packages.every((p) => p.weight <= 25000)).toBe(true);
    expect(packages.reduce((t, p) => t + p.weight, 0)).toBe(36800);
  });

  test("pasados los 150 cm de alto se abre otro bulto", () => {
    const packages = buildPackages([{ id: "cam", quantity: 13 }], [camara]);

    expect(packages).toHaveLength(2);
    expect(packages.every((p) => p.height <= 150)).toBe(true);
  });

  test("un producto sin medidas corta en vez de cotizar cualquier cosa", () => {
    expect(() =>
      buildPackages([{ id: "x", quantity: 1 }], [{ id: "x", weight_grams: null }])
    ).toThrow(BultoError);
  });

  test("un producto de más de 25 kg no se puede mandar por Correo", () => {
    expect(() =>
      buildPackages([{ id: "big", quantity: 1 }], [{ ...kit, id: "big", weight_grams: 30000 }])
    ).toThrow(BultoError);
  });
});
