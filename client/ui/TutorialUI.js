import strings from '../../shared/strings.js';

const TUTORIAL_KEY = 'nps_tutorial_done';

export class TutorialUI {
  constructor(scene) {
    this.scene = scene;
    this.slideIndex = 0;
    this.container = null;
    this.slides = [
      { title: strings.TUTORIAL.slide1_title, desc: strings.TUTORIAL.slide1_desc, binds: strings.TUTORIAL.slide1_keybinds },
      { title: strings.TUTORIAL.slide2_title, desc: strings.TUTORIAL.slide2_desc, binds: strings.TUTORIAL.slide2_keybinds },
      { title: strings.TUTORIAL.slide3_title, desc: strings.TUTORIAL.slide3_desc, binds: strings.TUTORIAL.slide3_keybinds },
    ];
  }

  shouldShow() {
    try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; }
  }

  dismissForever() {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch {}
  }

  show(onComplete) {
    this.container = this.scene.add.container(0, 0).setDepth(300).setScrollFactor(0);
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    this.overlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.75).setInteractive();
    this.container.add(this.overlay);

    this.panelBg = this.scene.add.graphics();
    this.panelBg.fillStyle(0x1a1a2e, 1);
    this.panelBg.fillRoundedRect(w / 2 - 250, h / 2 - 160, 500, 320, 16);
    this.panelBg.lineStyle(2, 0x4fc3f7, 0.8);
    this.panelBg.strokeRoundedRect(w / 2 - 250, h / 2 - 160, 500, 320, 16);
    this.container.add(this.panelBg);

    this.titleText = this.scene.add.text(w / 2, h / 2 - 120, '', {
      fontFamily: 'monospace', fontSize: '22px', color: '#4fc3f7', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.container.add(this.titleText);

    this.descText = this.scene.add.text(w / 2, h / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#b0b0d0', align: 'center', lineSpacing: 6
    }).setOrigin(0.5);
    this.container.add(this.descText);

    this.bindText = this.scene.add.text(w / 2, h / 2 + 60, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffb74d', align: 'center'
    }).setOrigin(0.5);
    this.container.add(this.bindText);

    this.nextBtn = this.scene.add.text(w / 2, h / 2 + 110, strings.TUTORIAL.done, {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      backgroundColor: '#16213e', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.container.add(this.nextBtn);

    this.dotContainer = this.scene.add.container(0, 0);
    this.container.add(this.dotContainer);
    this.dots = [];
    for (let i = 0; i < this.slides.length; i++) {
      const dot = this.scene.add.circle(w / 2 - 20 + i * 20, h / 2 + 85, 5, i === 0 ? 0x4fc3f7 : 0x3a3a5a);
      this.dots.push(dot);
      this.dotContainer.add(dot);
    }

    this.nextBtn.on('pointerdown', () => {
      this.slideIndex++;
      if (this.slideIndex >= this.slides.length) {
        this.dismissForever();
        this.destroy();
        if (onComplete) onComplete();
      } else {
        this.renderSlide();
      }
    });

    this.renderSlide();
  }

  renderSlide() {
    const slide = this.slides[this.slideIndex];
    this.titleText.setText(slide.title);
    this.descText.setText(slide.desc);
    this.bindText.setText(slide.binds);
    this.nextBtn.setText(this.slideIndex === this.slides.length - 1 ? strings.TUTORIAL.done : 'Next');

    this.dots.forEach((dot, i) => {
      dot.setFillStyle(i === this.slideIndex ? 0x4fc3f7 : 0x3a3a5a);
    });
  }

  destroy() {
    if (this.container) this.container.destroy(true);
    this.container = null;
  }
}
