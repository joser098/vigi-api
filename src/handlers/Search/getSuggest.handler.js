const _getSuggestions = require("../../controllers/Search/getSuggestions.controller");
const { formatPrice }= require("../../services/scripts");

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
      if(product.has_promotion && product.discount > 0 && product.discount < 51){
        const price_formated = formatPrice(product.price, product.discount);

        product.price = price_formated.price_discount;
        product.price_diferred = price_formated.price_diferred;
        product.price_original = price_formated.price_original;
      }
    });
    
    return res.status(200).json({ success: true, data: suggestList});
  } catch (error) {
    return res.status(500).json({ success: false, data: [], message: error.message })
  }
};

module.exports = getSuggest;
