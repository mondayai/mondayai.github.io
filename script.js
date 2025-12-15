document.addEventListener('DOMContentLoaded', () => {
    const track = document.querySelector('.slider-track');
    const cards = document.querySelectorAll('.feature-card');
    const nextBtn = document.querySelector('.slider-btn.next');
    const prevBtn = document.querySelector('.slider-btn.prev');

    if (!track || cards.length === 0) return;

    let currentIndex = 0;

    const updateSliderPosition = () => {
        if (cards.length === 0) return;
        const cardWidth = cards[0].offsetWidth;
        const gap = parseFloat(getComputedStyle(track).gap) || 0;
        const slideAmount = (cardWidth + gap) * currentIndex;

        track.style.transform = `translateX(-${slideAmount}px)`;

        // Update button states
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex >= cards.length - 1; // Simplify to stopping at last card

        // Optional: Opacity update for visual flair
        prevBtn.style.opacity = currentIndex === 0 ? '0.5' : '1';
        nextBtn.style.opacity = currentIndex >= cards.length - 1 ? '0.5' : '1';
    };

    window.addEventListener('resize', updateSliderPosition);

    nextBtn.addEventListener('click', () => {
        if (currentIndex < cards.length - 1) {
            currentIndex++;
            updateSliderPosition();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateSliderPosition();
        }
    });

    // Initialize
    updateSliderPosition();
});
