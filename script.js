// script.js
console.log('Antigravity Clone Loaded');

const slider = document.getElementById('cardSlider');
const prevBtn = document.querySelector('.slider-btn.prev');
const nextBtn = document.querySelector('.slider-btn.next');

if (slider && prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
        slider.scrollBy({
            left: -slider.clientWidth / 1.5,
            behavior: 'smooth'
        });
    });

    nextBtn.addEventListener('click', () => {
        slider.scrollBy({
            left: slider.clientWidth / 1.5,
            behavior: 'smooth'
        });
    });
}
