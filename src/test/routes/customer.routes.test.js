require("dotenv").config({ path: ".env.test" });
// Anything .env.test does not define falls back to .env. Values in .env.test win.
require("dotenv").config();

// Registering sends a verification email. Mocked so the suite does not hit
// Resend, and does not bounce mail at a fake address.
jest.mock("../../controllers/Notifications/sendEmail", () =>
  jest.fn(async () => ({ id: "mocked-email" }))
);

const supertest = require("supertest");
const app = require("../../app");
const { query, closeConnection } = require("../../db/client");

const request = supertest(app);

const json = {
  username: "testuser",
  email: "test@email.com",
  password: "Micontrasena123",
  name: "Jose",
  last_name: "Jaramillo",
  phone: "1132456723",
  address: {
    province: "Buenos Aires",
    location: "Ramos Mejia",
    address_name: "Figueroa",
    address_number: "973",
    department: "B",
    zip_code: "1704",
  },
  conditions_accepted: true,
  DNI: "12980911",
};

// The suite registers a customer and then expects the duplicate to be rejected,
// so it only works against a clean slate. Without this it passes once and fails
// on every later run.
// carts, cart_items, addresses and verification_hashes all cascade from
// customers, so one delete is enough.
const removeTestCustomer = async () => {
  await query(`delete from customers where email = $1`, [json.email]);
};

beforeAll(removeTestCustomer);

afterAll(async () => {
  await removeTestCustomer();
  await closeConnection();
});

describe("POST Register Customer", () => {
  it("should return status 201 && have property in true", async () => {
    const response = await request.post("/api/customer").send(json);
    expect(response.status).toBe(201);
    expect(response.body.customer.inserted).toBe(1);
    expect(response.body.cart.inserted).toBe(1);
  });

  it("should return status 409 && email already exits message", async () => {
    const response = await request.post("/api/customer").send(json);
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      `Ya existe un usuario con este correo ${json.email}`
    );
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
