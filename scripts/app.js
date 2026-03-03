// app.js — Navegação entre seções
(function(){
  const navTabs = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.section');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.section;

      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      sections.forEach(s => {
        s.classList.toggle('active', s.id === 'section-' + target);
      });

      // Builder precisa de user-select:none, tradutor não
      document.body.style.userSelect = (target === 'builder') ? 'none' : '';

      // Disparar evento para que o builder recalcule zoom ao ficar visível
      window.dispatchEvent(new Event('section-change'));
    });
  });
})();
