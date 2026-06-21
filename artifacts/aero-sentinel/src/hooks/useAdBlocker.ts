import { useState, useEffect } from "react";

/**
 * AdBlocker tespit hook'u.
 * Sayfaya gizli bir test elementi ekleyerek reklam engelleyici olup olmadığını tespit eder.
 *
 * Kullanım:
 * ```tsx
 * const { adblockDetected } = useAdBlocker();
 * if (adblockDetected) return <AdPlaceholder />;
 * ```
 */
export function useAdBlocker() {
  const [adblockDetected, setAdblockDetected] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const testDiv = document.createElement("div");
    testDiv.className = "adsbygoogle ad-container ad-banner";
    testDiv.style.cssText = "position:absolute;height:1px;width:1px;top:-999px;left:-999px;";
    document.body.appendChild(testDiv);

    // Birden çok yöntemle tespit
    const checkAdblock = () => {
      // 1. Boyut kontrolü — reklam engelleyiciler genellikle ad sınıflarını gizler
      const rect = testDiv.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) {
        setAdblockDetected(true);
        setChecking(false);
        testDiv.remove();
        return;
      }

      // 2. computed style kontrolü
      const style = window.getComputedStyle(testDiv);
      if (style.display === "none" || style.visibility === "hidden") {
        setAdblockDetected(true);
        setChecking(false);
        testDiv.remove();
        return;
      }

      // 3. AdSense'in yüklenip yüklenmediğini kontrol et (gecikmeli)
      setTimeout(() => {
        const adsByGoogle = document.querySelectorAll(".adsbygoogle ins");
        const allHidden = Array.from(adsByGoogle).every(
          (el) => el.getBoundingClientRect().height === 0
        );
        if (adsByGoogle.length > 0 && allHidden) {
          setAdblockDetected(true);
        }
        setChecking(false);
        testDiv.remove();
      }, 1500);
    };

    checkAdblock();

    return () => {
      testDiv.remove();
    };
  }, []);

  return { adblockDetected, checking };
}