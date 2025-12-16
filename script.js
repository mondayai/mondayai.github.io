// 1. โหลด Component
// 1. โหลด Component
async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;
        } else {
            console.error(`Element with id '${elementId}' not found.`);
        }

        // ✨ เพิ่ม: ถ้าโหลด Navbar เสร็จแล้ว ให้เช็คว่าอยู่หน้าไหนเพื่อทำ Highlight
        if (elementId === 'navbar-placeholder') {
            setActiveLink();
        }

    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
        // Alert user if they are using file:// protocol
        if (window.location.protocol === 'file:') {
            alert(`Error loading components! \n\nYou are opening the file directly (file://). To use 'fetch', you must run a local server (e.g. VS Code Live Server or 'python3 -m http.server').`);
        }
    }
}

// 2. ฟังก์ชันเช็คหน้าปัจจุบันเพื่อเปลี่ยนสีเมนู
function setActiveLink() {
    // หาชื่อไฟล์ปัจจุบัน (เช่น index.html, product.html)
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    // ดึงลิงก์ทั้งหมดใน Navbar มาเช็ค
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(link => {
        // ดึงค่า href ของลิงก์ (เช่น "product.html")
        const linkPath = link.getAttribute('href');

        // ถ้าชื่อไฟล์ตรงกัน ให้เติม class "active"
        if (linkPath === currentPath) {
            link.classList.add('active'); // ⚠️ อย่าลืมไปเขียน CSS .active { color: ... } นะครับ
        }
    });
}

// 3. เรียกใช้งาน
loadComponent('navbar-placeholder', 'components/navbar.html');
loadComponent('footer-placeholder', 'components/footer.html');

console.log('Antigravity Clone Loaded');

// 4. ส่วน Slider (ของคุณถูกต้องแล้วครับ เยี่ยมมาก!)
document.addEventListener('DOMContentLoaded', () => {
    // Slider ฟีเจอร์
    setupSlider({
        containerId: 'cardSlider',
        prevBtnId: 'features-prev',
        nextBtnId: 'features-next',
        itemSelector: '.feature-card'
    });

    // Slider วิดีโอ Reels
    setupSlider({
        containerSelector: '.card-slider-list',
        prevBtnId: 'reels-prev',
        nextBtnId: 'reels-next',
        itemSelector: '.card-slider-item',
        gap: 16
    });
});

// ฟังก์ชัน Slider Helper
function setupSlider({ containerId, containerSelector, prevBtnId, nextBtnId, itemSelector, gap = 0 }) {
    const slider = containerId ? document.getElementById(containerId) : document.querySelector(containerSelector);
    const prevBtn = document.getElementById(prevBtnId);
    const nextBtn = document.getElementById(nextBtnId);

    // เพิ่มการเช็ค safety หน่อย กัน error ถ้าหน้าไหนไม่มี slider
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


