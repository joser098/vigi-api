const feedback = async (req, res) => {
  try {
    const { payment_id, status } = req.query;

    if(status == "approved"){
      return res
        .status(200)
        .redirect(`${process.env.CLIENT_URL}/payment/${payment_id}`);
    }

    return res.status(200).redirect(`${process.env.CLIENT_URL}/perfil`)
  } catch (error) {
    return res.status(400).redirect(`${process.env.CLIENT_URL}`);
  }
};
module.exports = feedback;
