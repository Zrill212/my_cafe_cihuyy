const checkSubscription = require("../middleware/checkSubscription");

router.get("/produk", checkSubscription, controller.getProduk);