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

describe("GET ALL PRODUCTS", () => {
    it("should return status 200", async () => {
        const response = await request.get("/api/search/getAllProducts");
        expect(response.status).toBe(200);
    });
    
    it("should return an object with success:true and data:array", async () => {
        const response = await request.get("/api/search/getAllProducts");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
    });
});

describe("GET PRODUCT BY ID", () => {
    it("should return status 400 if id is not correct format", async () => {
        const response = await request.get("/api/search/getProduct?id=1");
        expect(response.status).toBe(400);
    });
    
    it("should return an object with success:true and data:object", async () => {
        const response = await request.get("/api/search/getProduct?id=659db95d1d04b9bcf9986030");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Object));
    });

    it("should return an object with success:false and message:string when id doesn't exits", async () => {
        const response = await request.get("/api/search/getProduct?id=65ab3e9ab270f3fa3a60db27");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", "Product not found");
    });
});

describe("GET PRODUCT BY MODEL", () => {
    it("should return status 400 if model is not correct type", async () => {
        const response = await request.get("/api/search/getProduct?model=");
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("success", false);
    });
    
    it("should return an object with success:true and data:object if search 'C1C'", async () => {
        const response = await request.get("/api/search/getProduct?model=C1C");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
        expect(response.body.data).toHaveLength(1);
    });

    it("should return an object with success:true and data:object if search 'Bullet", async () => {
        const response = await request.get("/api/search/getProduct?model=2C");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
        expect(response.body.data.length).toBeGreaterThan(1);
    });

    it("should return an object with success:false and message:string when model doesn't exits", async () => {
        const response = await request.get("/api/search/getProduct?model=1234567890");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array))
        expect(response.body.data).toHaveLength(0);;
    });
});

describe("GET PRODUCTS BY CATEGORY", () => {
    it("should return status 400 if category is not correct type", async () => {
        const response = await request.get("/api/search/getProducts?category=vision");
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("success", false);
        expect(response.body.message).toContain("Invalid enum value.");
    });

    it("should return status 400 if category is undefined", async () => {
        const response = await request.get("/api/search/getProducts?category");
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("success", false);
        expect(response.body).toHaveProperty("message", "Missing query");
    });
    
    xit("should return an object with success:true and data:array if search 'alarmas'", async () => {
        const response = await request.get("/api/search/getProducts?category=alarmas");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
        expect(response.body.data.length).toBeGreaterThan(1);
    });

    it("should return an object with success:true and data:array if search 'camaras'", async () => {
        const response = await request.get("/api/search/getProducts?category=camaras");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
        expect(response.body.data.length).toBeGreaterThan(1);
    });

    xit("should return an object with success:true and data:array if search 'dvr'", async () => {
        const response = await request.get("/api/search/getProducts?category=dvr");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
        expect(response.body.data.length).toBeGreaterThan(1);
    });

    xit("should return an object with success:true and data:array if search 'almacenamiento'", async () => {
        const response = await request.get("/api/search/getProducts?category=almacenamiento");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
        expect(response.body.data.length).toBeGreaterThan(1);
    });

    xit("should return an object with success:true and data:array if search 'kits'", async () => {
        const response = await request.get("/api/search/getProducts?category=kits");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));
        expect(response.body.data.length).toBeGreaterThan(1);
    });
});

describe("GET PRODUCTS IN PROMOTION", () => {
    it("should return an object with success:true and data:array", async () => {
        const response = await request.get("/api/search/getProducts?promotion=true");
        expect(response.body).toHaveProperty("success", true);
        expect(response.body).toHaveProperty("data", expect.any(Array));;
    });
});