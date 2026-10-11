"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const mobileMenu = document.getElementById("mobileMenu");
    const navLinks = document.getElementById("navLinks");
    const currentYear = document.getElementById("currentYear");

    // Current year in footer
    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    // Mobile navigation
    if (mobileMenu && navLinks) {
        mobileMenu.addEventListener("click", () => {
            const isOpen = navLinks.classList.toggle("is-open");

            mobileMenu.setAttribute("aria-expanded", String(isOpen));
            mobileMenu.setAttribute(
                "aria-label",
                isOpen ? "Đóng điều hướng" : "Mở điều hướng"
            );
        });

        // Close menu after selecting a navigation link
        navLinks.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                navLinks.classList.remove("is-open");
                mobileMenu.setAttribute("aria-expanded", "false");
                mobileMenu.setAttribute("aria-label", "Mở điều hướng");
            });
        });

        // Close menu when clicking outside
        document.addEventListener("click", (event) => {
            const clickedInsideMenu = navLinks.contains(event.target);
            const clickedMenuButton = mobileMenu.contains(event.target);

            if (!clickedInsideMenu && !clickedMenuButton) {
                navLinks.classList.remove("is-open");
                mobileMenu.setAttribute("aria-expanded", "false");
                mobileMenu.setAttribute("aria-label", "Mở điều hướng");
            }
        });
    }
});