const _getSuggestions = require("../../controllers/Search/getSuggestions.controller");
const { setPromotionsToProduct }= require("../../services/scripts");

const getSuggest = async (req, res) => {
  try {
    const { keyword, limit } = req.body;

    let suggestList = await _getSuggestions(keyword);

    suggestList = suggestList.sort((a, b) => {
        if (a.provider === 'Ezviz' && b.provider !== 'Ezviz') {
          return -1; // "a" debe ir antes que "b"
        } else if (a.provider !== 'Ezviz' && b.provider === 'Ezviz') {
          return 1; // "b" debe ir antes que "a"
        } else {
          return 0; // Sin cambio en el orden
        }
      });

    if(limit) {
      suggestList = suggestList.slice(0, limit);
    }

    suggestList.map((product) => {
      setPromotionsToProduct(product);
    });
    
    return res.status(200).json({ success: true, data: suggestList});
  } catch (error) {
    return res.status(500).json({ success: false, data: [], message: error.message })
  }
};

module.exports = getSuggest;
