
      // Open WhatsApp using the number from config.js
      var whatsappUrl =
        "https://wa.me/" +
        cfg.WHATSAPP_NUMBER +
        "?text=" +
        encodeURIComponent(message);

      window.location.href = whatsappUrl;
