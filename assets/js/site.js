const body = document.body;
const menuToggle = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("[data-menu]");
const yearTarget = document.querySelector("[data-year]");
const revealItems = document.querySelectorAll("[data-reveal]");
const navLinks = document.querySelectorAll(".nav a[href^='#']");
const sections = document.querySelectorAll("main section[id]");
const lightboxTriggers = document.querySelectorAll("[data-lightbox-src]");

if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

if (menuToggle && menu) {
  const closeMenu = () => {
    body.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = body.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      closeMenu();
    }
  });
}

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -30px 0px",
    }
  );

  revealItems.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 45, 260)}ms`;
    revealObserver.observe(item);
  });

  if (sections.length && navLinks.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          navLinks.forEach((link) => {
            const isActive = link.getAttribute("href") === `#${entry.target.id}`;
            link.classList.toggle("is-active", isActive);
          });
        });
      },
      {
        threshold: 0.5,
        rootMargin: "-20% 0px -45% 0px",
      }
    );

    sections.forEach((section) => sectionObserver.observe(section));
  }
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

if (lightboxTriggers.length && "HTMLDialogElement" in window) {
  const lightbox = document.createElement("dialog");
  lightbox.className = "project-lightbox";
  lightbox.innerHTML = `
    <div class="project-lightbox__inner">
      <button class="project-lightbox__close" type="button" aria-label="Close image">Close</button>
      <figure class="project-lightbox__figure">
        <img src="" alt="">
        <figcaption class="project-lightbox__caption"></figcaption>
      </figure>
    </div>
  `;

  document.body.appendChild(lightbox);

  const lightboxImage = lightbox.querySelector("img");
  const lightboxCaption = lightbox.querySelector(".project-lightbox__caption");
  const closeButton = lightbox.querySelector(".project-lightbox__close");

  const closeLightbox = () => {
    if (lightbox.open) {
      lightbox.close();
    }
  };

  lightboxTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const image = trigger.querySelector("img");
      const figcaption = trigger.closest("figure")?.querySelector("figcaption");
      const src = trigger.getAttribute("data-lightbox-src");
      const alt = trigger.getAttribute("data-lightbox-alt") || image?.alt || "";
      const caption = figcaption?.textContent?.trim() || alt;

      if (!src) {
        return;
      }

      lightboxImage.src = src;
      lightboxImage.alt = alt;
      lightboxCaption.textContent = caption;
      lightbox.showModal();
    });
  });

  closeButton.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (event) => {
    const bounds = lightbox.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside) {
      closeLightbox();
    }
  });

  lightbox.addEventListener("close", () => {
    lightboxImage.src = "";
    lightboxImage.alt = "";
    lightboxCaption.textContent = "";
  });
}
