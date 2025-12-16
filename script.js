// script.js
console.log('Antigravity Clone Loaded');

document.addEventListener('DOMContentLoaded', () => {
    setupSlider({
        containerId: 'cardSlider',
        prevBtnId: 'features-prev',
        nextBtnId: 'features-next',
        itemSelector: '.feature-card'
    });

    setupSlider({
        containerSelector: '.card-slider-list',
        prevBtnId: 'reels-prev',
        nextBtnId: 'reels-next',
        itemSelector: '.card-slider-item',
        gap: 16
    });
});

function setupSlider({ containerId, containerSelector, prevBtnId, nextBtnId, itemSelector, gap = 0 }) {
    const slider = containerId ? document.getElementById(containerId) : document.querySelector(containerSelector);
    const prevBtn = document.getElementById(prevBtnId);
    const nextBtn = document.getElementById(nextBtnId);

    if (!slider || !prevBtn || !nextBtn) return;

    prevBtn.addEventListener('click', () => {
        const slideItem = slider.querySelector(itemSelector);
        const slideWidth = slideItem ? slideItem.offsetWidth + gap : 300;
        slider.scrollBy({ left: -slideWidth, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
        const slideItem = slider.querySelector(itemSelector);
        const slideWidth = slideItem ? slideItem.offsetWidth + gap : 300;
        slider.scrollBy({ left: slideWidth, behavior: 'smooth' });
    });
}
