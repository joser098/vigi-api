require('dotenv').config({ path: '.env.test' });
const supertest = require("supertest");
const app = require("../../app");
const request = supertest(app);

describe("GET ALL ORDERS", () => {
    it("should return status 200", async () => {
        const response = await request.get("/api/search/getOrders");
        expect(response.status).toBe(200);
    });
    
    it("should return an object with success:true and data:array", async () => {
        const response = await request.get("/api/search/getOrders");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
    });
});


describe("GET ORDER BY ID", () => {
    it("should return status 400 if id is not correct format", async () => {
        const response = await request.get("/api/search/getOrder?id=1");
        expect(response.status).toBe(400);
    });
    
    it("should return an object with success:true and data:object", async () => {
        const response = await request.get("/api/search/getOrder?id=65ab3e9ab270f3fa3a60db26");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Object));
    });

    it("should return an object with success:false and message:string when id doesn't exits", async () => {
        const response = await request.get("/api/search/getOrder?id=65ab3e9ab270f3fa3a60db27");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", "Order not found");
    });
});

describe("GET ORDERS BY STATUS", () => {
    it("should return status 400 if status is not correct type", async () => {
        const response = await request.get("/api/search/getOrders?status=1");
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("success", false);
    });
    
    it("should return an object with success:true and data:array", async () => {
        const response = await request.get("/api/search/getOrders?status=recibido");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
    });
});