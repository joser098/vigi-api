// La barra al final de una variable de entorno costó el webhook de Mercado
// Pago, las back_urls y el link de verificación de mail. Que no vuelva.
const { joinUrl } = require("../../utils/urls");

describe("joinUrl", () => {
  it("no deja doble slash cuando la base termina en barra", () => {
    expect(joinUrl("https://api.vigi.cam/", "/api/payment/webhook")).toBe(
      "https://api.vigi.cam/api/payment/webhook"
    );
  });

  it("arma bien cuando la base no termina en barra", () => {
    expect(joinUrl("https://api.vigi.cam", "/api/payment/webhook")).toBe(
      "https://api.vigi.cam/api/payment/webhook"
    );
  });

  it("aguanta varias barras de los dos lados", () => {
    expect(joinUrl("https://api.vigi.cam///", "///api/x")).toBe(
      "https://api.vigi.cam/api/x"
    );
  });

  it("acepta la ruta sin barra inicial", () => {
    expect(joinUrl("https://api.vigi.cam/", "api/x")).toBe("https://api.vigi.cam/api/x");
  });

  it("sin ruta devuelve la base limpia", () => {
    expect(joinUrl("https://www.vigi.cam/")).toBe("https://www.vigi.cam");
  });

  it("no rompe si la variable de entorno no está definida", () => {
    expect(joinUrl(undefined, "/api/x")).toBe("/api/x");
  });
});
