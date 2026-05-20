const AppConfig = (() => {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "172.28.16.1";
    const isGitHubPages = window.location.hostname.includes("ama-sandonato.github.io");

    return {
        apiUrl: isGitHubPages ? "https://script.google.com/macros/s/AKfycbywhbbHNVrJIKJSH0RJ5sllwp-khgMkKK0zhP9_pMNWHMi__P_3SoTxPCpl0lVJ99gW/exec" : "http://localhost:8080/exec",
        debugMode: isLocal,
        timeout: isLocal ? 1000 : 5000
    };
})();
