require("dotenv").config({ path: ".env.test" });
const supertest = require("supertest");
const app = require("../../app");
const request = supertest(app);

const json = {
  username: "testuser",
  email: "test@email.com",
  password: "Micontrasena123",
  name: "Jose",
  last_name: "Jaramillo",
  address: "Figueroa 973, CABA",
  phone: "1132456723",
  DNI: "12980911",
};

describe("POST Register Customer", () => {
  it("should return status 201 && have property in true", async () => {
    const response = await request.post("/api/customer").send(json);
    expect(response.status).toBe(201);
    expect(response.body.customer.acknowledged).toBe(true);
    expect(response.body.cart.acknowledged).toBe(true);
    expect(response.body.asssingmentResult.acknowledged).toBe(true);
  });

  it("should return status 409 && email already exits message", async () => {
    const response = await request.post("/api/customer").send(json);
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Customer with email test@email.com already exists");
  });

  it("should return status 400 && invaid email message", async () => {
    const response = await request.post("/api/customer").send({
      username: "joser098",
      email: "jsx.com",
    });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Invalid email");
  });

  it("should return status 400 && Name is required message", async () => {
    const response = await request.post("/api/customer").send({
      username: "joser098",
      email: "correo@valido.com",
      password: "contrasena123",
    });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Name is required");
  });
});
