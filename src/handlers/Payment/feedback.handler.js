const feedback = async (req, res) => {
  try {
    const { payment_id, status } = req.query;

    if(status == "approved"){
      return res
        .status(200)
        .redirect(`http://localhost:4321/payment/${payment_id}`);
    }

    return res.status(200).redirect("http://localhost:4321/perfil")
  } catch (error) {
    return res.status(400).redirect(`http://vigi.cam`);
  }
};
module.exports = feedback;
