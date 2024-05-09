const cotizadorAndreani = async (data) => {
  try {
    const response = await fetch(
      "https://cotizador-api.andreani.com/api/v1/Cotizar",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Xapikey: `TEST_XqPMiwXzTRKHH0mF3gmtPtQt3LNGIuqCTdgaUHINMdmlaFid0x9MzlYTKXPxluYQ`,
        },
        body: JSON.stringify(data),
      }
    );

    const res = await response.json();

    return res;
  } catch (error) {
    return error;
  }
};

module.exports = cotizadorAndreani;
