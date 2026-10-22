import { rangerPose } from "./locomotion.js";
import { emptyArt, validateArt, paintLine } from "./art-document.js";
export function ranger() {
  const d = emptyArt("pixel", 64, 64);
  d.name = "Ember Ranger · Run";
  d.palette = [
    "#00000000",
    "#111524ff",
    "#26364aff",
    "#425d75ff",
    "#82a6b3ff",
    "#f3c978ff",
    "#b47d43ff",
    "#693341ff",
    "#ae5261ff",
    "#dde5d4ff",
    "#a1f7eaff",
    "#42b7c3ff",
    "#246875ff",
    "#714739ff",
    "#352938ff",
    "#e19065ff",
  ];
  d.motion = {
    version: 1,
    kind: "run",
    facing: "right",
    distance: 44,
    groundY: 59,
    feet: [
      { id: "near", points: [], contact: [] },
      { id: "far", points: [], contact: [] },
    ],
  };
  d.frames = [];
  for (let f = 0; f < 8; f++) {
    const u = (f / 8) * Math.PI * 2,
      pose = rangerPose(f / 8),
      bob = pose.bob,
      layers = ["Cloak", "Armor", "Sparks"].map((name, i) => ({
        id: `layer-${i}`,
        name,
        visible: true,
        opacity: 1,
        pixels: Array(4096).fill(0),
      }));
    let target = layers[0].pixels;
    function pixel(x, y, c) {
      x = Math.round(x);
      y = Math.round(y);
      if (x >= 0 && y >= 0 && x < 64 && y < 64) target[y * 64 + x] = c;
    }
    function poly(p, c) {
      for (
        let y = Math.floor(Math.min(...p.map((v) => v[1])));
        y <= Math.ceil(Math.max(...p.map((v) => v[1])));
        y++
      ) {
        const xs = [];
        for (let i = 0; i < p.length; i++) {
          const a = p[i],
            b = p[(i + 1) % p.length];
          if (
            (a[1] <= y + 0.5 && b[1] > y + 0.5) ||
            (b[1] <= y + 0.5 && a[1] > y + 0.5)
          )
            xs.push(a[0] + ((y + 0.5 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2)
          for (let x = Math.ceil(xs[i] - 0.5); x < xs[i + 1] - 0.5; x++)
            pixel(x, y, c);
      }
    }
    function line(a, b, c, size = 1) {
      paintLine(target, 64, 64, a.map(Math.round), b.map(Math.round), c, {
        size,
      });
    }
    const by = (y) => y + bob,
      wind = Math.round(Math.sin(u) * 2);
    poly(
      [
        [30, by(22)],
        [21, by(24)],
        [12, by(34 + wind)],
        [7, by(43)],
        [16, by(42)],
        [20, by(47)],
        [29, by(40)],
        [34, by(28)],
      ],
      1,
    );
    poly(
      [
        [29, by(24)],
        [22, by(26)],
        [14, by(34 + wind)],
        [11, by(40)],
        [19, by(38)],
        [21, by(44)],
        [28, by(38)],
        [32, by(28)],
      ],
      7,
    );
    poly(
      [
        [26, by(26)],
        [21, by(30)],
        [17, by(37)],
        [21, by(35)],
        [23, by(39)],
        [28, by(33)],
        [30, by(26)],
      ],
      8,
    );
    line([13, by(40)], [20, by(36)], 6);
    line([21, by(42)], [26, by(36)], 13);
    target = layers[1].pixels;
    function leg(index, front) {
      const { hip, ankle: foot, knee } = pose.legs[index];
      line(hip, knee, 1, 7);
      line(knee, foot, 1, 6);
      line(hip, knee, front ? 3 : 2, 5);
      line(knee, foot, front ? 3 : 2, 4);
      line(
        [knee[0] - 1, knee[1] - 2],
        [foot[0] - 1, foot[1] - 3],
        front ? 4 : 3,
        1,
      );
      poly(
        [
          [foot[0] - 3, foot[1] - 2],
          [foot[0] + 1, foot[1] - 3],
          [foot[0] + 5, foot[1] + 1],
          [foot[0] + 5, foot[1] + 3],
          [foot[0] - 4, foot[1] + 3],
        ],
        1,
      );
      line(
        [foot[0] - 2, foot[1]],
        [foot[0] + 2, foot[1] + 1],
        front ? 6 : 13,
        2,
      );
      line(
        [knee[0] - 2, knee[1] - 2],
        [knee[0] + 2, knee[1] - 1],
        front ? 5 : 6,
        2,
      );
    }
    leg(1, false);
    const farArm = pose.arms[1];
    line(farArm.shoulder, farArm.elbow, 1, 5);
    line(farArm.elbow, farArm.hand, 2, 4);
    leg(0, true);
    poly(
      [
        [26, by(23)],
        [34, by(22)],
        [39, by(27)],
        [36, by(37)],
        [39, by(41)],
        [29, by(43)],
        [25, by(36)],
        [24, by(29)],
      ],
      1,
    );
    poly(
      [
        [28, by(24)],
        [33, by(24)],
        [36, by(28)],
        [34, by(35)],
        [28, by(36)],
        [26, by(30)],
      ],
      3,
    );
    poly(
      [
        [30, by(25)],
        [34, by(26)],
        [35, by(29)],
        [31, by(32)],
        [28, by(30)],
      ],
      4,
    );
    line([27, by(35)], [35, by(36)], 6, 2);
    pixel(32, by(35), 5);
    line([28, by(39)], [35, by(39)], 2, 3);
    line([31, by(38)], [32, by(42)], 13);
    // Angular helmet, raised brow, narrow luminous visor and layered neck guard.
    poly(
      [
        [28, by(9)],
        [35, by(8)],
        [40, by(12)],
        [42, by(18)],
        [38, by(24)],
        [29, by(23)],
        [26, by(18)],
        [26, by(12)],
      ],
      1,
    );
    poly(
      [
        [29, by(10)],
        [35, by(10)],
        [38, by(13)],
        [38, by(17)],
        [29, by(18)],
        [28, by(14)],
      ],
      3,
    );
    poly(
      [
        [30, by(10)],
        [34, by(10)],
        [36, by(12)],
        [30, by(14)],
      ],
      4,
    );
    poly(
      [
        [29, by(18)],
        [40, by(17)],
        [38, by(21)],
        [31, by(22)],
      ],
      2,
    );
    line([34, by(16)], [40, by(16)], 10);
    pixel(34, by(17), 11);
    pixel(40, by(17), 12);
    line([28, by(14)], [33, by(13)], 6);
    line([28, by(15)], [30, by(19)], 5);
    poly(
      [
        [30, by(9)],
        [26, by(6)],
        [21, by(7)],
        [19 + wind, by(12)],
        [23, by(10)],
        [27, by(11)],
      ],
      7,
    );
    line([24, by(7)], [28, by(8)], 8, 2);
    line([29, by(23)], [35, by(24)], 6, 2);
    const { elbow, hand } = pose.arms[0];
    line([29, by(26)], elbow, 1, 7);
    line(elbow, hand, 1, 6);
    line([29, by(26)], elbow, 3, 5);
    line(elbow, hand, 3, 4);
    line([28, by(26)], [elbow[0] - 1, elbow[1] - 1], 4, 2);
    line([hand[0] - 2, hand[1] - 2], [hand[0] + 1, hand[1] + 1], 6, 3);
    poly(
      [
        [25, by(23)],
        [30, by(22)],
        [34, by(25)],
        [31, by(29)],
        [26, by(28)],
      ],
      1,
    );
    poly(
      [
        [26, by(24)],
        [30, by(24)],
        [32, by(25)],
        [30, by(27)],
        [27, by(27)],
      ],
      5,
    );
    // Short hooked rune blade held in the forward hand.
    const tip = [hand[0] + 13, hand[1] - 12];
    line(hand, [hand[0] - 2, hand[1] + 3], 1, 3);
    line(hand, [hand[0] - 1, hand[1] + 2], 13);
    poly(
      [
        [hand[0] - 1, hand[1] - 2],
        [tip[0] - 2, tip[1] + 1],
        [tip[0], tip[1] - 3],
        [tip[0] + 2, tip[1] + 2],
        [hand[0] + 2, hand[1] + 1],
      ],
      1,
    );
    line([hand[0] + 1, hand[1] - 2], [tip[0], tip[1]], 4, 2);
    line([hand[0] + 2, hand[1] - 3], [tip[0] + 1, tip[1] - 1], 10);
    line([hand[0] - 3, hand[1] - 2], [hand[0] + 3, hand[1] + 3], 6, 2);
    pixel(hand[0] + 2, hand[1] + 2, 5);
    target = layers[2].pixels;
    for (let j = 0; j < 4; j++) {
      const x = 10 + j * 4 - ((f + j) % 4),
        y = 25 + j * 3 + Math.round(Math.sin(u + j) * 2);
      pixel(x, y, 11);
      if (j % 2 === 0) pixel(x - 1, y, 12);
    }
    pose.legs.forEach((leg, i) => {
      d.motion.feet[i].points.push(leg.sole.map(Math.round));
      d.motion.feet[i].contact.push(leg.contact);
    });
    d.frames.push({
      id: `run-${f}`,
      name: `Run ${f + 1}`,
      duration: 80,
      layers,
    });
  }
  return validateArt(d);
}
export function rune() {
  const d = emptyArt("vector", 512, 512);
  d.name = "Tideglass · Inventory blade";
  const path = (d, fill, stroke, strokeWidth = 1, opacity = 1) => ({
    d,
    fill,
    stroke,
    strokeWidth,
    opacity,
  });
  const poly = (p, fill, stroke, width = 1) =>
    path(
      [["M", ...p[0]], ...p.slice(1).map((p) => ["L", ...p]), ["Z"]],
      fill,
      stroke,
      width,
    );
  const gradient = (from, to, stops) => ({ linear: { from, to, stops } });
  d.frames[0].layers = [
    {
      id: "aura",
      name: "Magic ribbons",
      visible: true,
      opacity: 1,
      paths: [
        path(
          [
            ["M", 120, 364],
            ["C", 18, 258, 398, 337, 393, 146],
            ["C", 458, 303, 171, 228, 120, 364],
            ["Z"],
          ],
          gradient(
            [80, 150],
            [410, 380],
            [
              [0, "#326e8b00"],
              [0.45, "#76e3d14d"],
              [1, "#2b86aa00"],
            ],
          ),
        ),
        path(
          [
            ["M", 134, 354],
            ["C", 23, 270, 367, 321, 395, 161],
          ],
          "none",
          "#76dac670",
          3,
        ),
        path(
          [
            ["M", 171, 404],
            ["C", 449, 394, 263, 168, 369, 80],
          ],
          "none",
          "#6acbb93a",
          8,
        ),
      ],
    },
    {
      id: "blade",
      name: "Forged blade",
      visible: true,
      opacity: 1,
      paths: [
        poly(
          [
            [191, 310],
            [319, 146],
            [371, 68],
            [356, 163],
            [242, 341],
            [213, 347],
          ],
          "#102c3e",
          "#0d1d2b",
          10,
        ),
        poly(
          [
            [202, 307],
            [328, 148],
            [365, 82],
            [347, 160],
            [232, 333],
            [216, 337],
          ],
          gradient(
            [210, 290],
            [342, 140],
            [
              [0, "#397386"],
              [0.45, "#b4e9dc"],
              [0.52, "#dff9df"],
              [1, "#568b9c"],
            ],
          ),
        ),
        poly(
          [
            [213, 321],
            [337, 154],
            [363, 89],
            [323, 149],
            [204, 305],
          ],
          "#dcf4e3",
        ),
        poly(
          [
            [215, 321],
            [339, 154],
            [348, 141],
            [344, 161],
            [231, 331],
          ],
          "#234d65",
        ),
        path(
          [
            ["M", 222, 302],
            ["L", 324, 166],
          ],
          "none",
          "#63e1cd",
          4,
        ),
        path(
          [
            ["M", 229, 301],
            ["L", 246, 275],
            ["L", 237, 277],
            ["M", 252, 267],
            ["L", 261, 255],
            ["L", 256, 251],
            ["L", 246, 265],
            ["M", 269, 244],
            ["L", 276, 231],
            ["L", 270, 233],
            ["M", 284, 223],
            ["L", 292, 209],
          ],
          "none",
          "#b5fff0",
          2,
        ),
        path(
          [
            ["M", 220, 305],
            ["L", 226, 300],
            ["M", 311, 176],
            ["L", 321, 162],
          ],
          "none",
          "#ffffff",
          2,
        ),
      ],
    },
    {
      id: "guard",
      name: "Engraved guard",
      visible: true,
      opacity: 1,
      paths: [
        path(
          [
            ["M", 170, 294],
            ["C", 162, 302, 164, 325, 193, 341],
            ["L", 229, 369],
            ["C", 256, 392, 276, 385, 282, 371],
            ["L", 259, 364],
            ["C", 251, 366, 244, 356, 244, 345],
            ["L", 207, 317],
            ["C", 194, 319, 185, 309, 190, 300],
            ["Z"],
          ],
          gradient(
            [170, 290],
            [270, 390],
            [
              [0, "#e8d9a1"],
              [0.35, "#b28b51"],
              [0.62, "#f3dc9b"],
              [1, "#6d4d36"],
            ],
          ),
          "#172c39",
          7,
        ),
        path(
          [
            ["M", 172, 300],
            ["C", 171, 319, 195, 335, 210, 341],
            ["M", 234, 358],
            ["C", 252, 378, 270, 380, 276, 374],
          ],
          "none",
          "#fff1bf",
          3,
        ),
        poly(
          [
            [205, 320],
            [225, 322],
            [244, 343],
            [229, 362],
            [209, 353],
            [197, 338],
          ],
          "#173944",
          "#122530",
          5,
        ),
        poly(
          [
            [214, 325],
            [227, 326],
            [236, 341],
            [227, 352],
            [211, 347],
            [205, 337],
          ],
          gradient(
            [210, 325],
            [233, 351],
            [
              [0, "#e9fff1"],
              [0.35, "#80e8d3"],
              [0.55, "#319b9d"],
              [1, "#164d66"],
            ],
          ),
          "#b7d6ae",
          2,
        ),
        poly(
          [
            [213, 327],
            [224, 328],
            [214, 342],
            [207, 336],
          ],
          "#c6ffdf",
        ),
        path(
          [
            ["M", 180, 313],
            ["L", 185, 319],
            ["M", 190, 323],
            ["L", 195, 328],
            ["M", 250, 374],
            ["L", 255, 376],
          ],
          "none",
          "#705838",
          2,
        ),
      ],
    },
    {
      id: "handle",
      name: "Wrapped grip and pommel",
      visible: true,
      opacity: 1,
      paths: [
        poly(
          [
            [203, 345],
            [224, 363],
            [173, 421],
            [150, 402],
          ],
          gradient(
            [158, 400],
            [205, 355],
            [
              [0, "#172a38"],
              [0.5, "#47616b"],
              [1, "#102c39"],
            ],
          ),
          "#112330",
          6,
        ),
        ...Array.from({ length: 6 }, (_, i) =>
          path(
            [
              ["M", 193 - i * 6, 355 + i * 7],
              ["L", 211 - i * 6, 369 + i * 7],
            ],
            "none",
            i % 2 ? "#d0ae72" : "#947249",
            5,
          ),
        ),
        poly(
          [
            [148, 396],
            [169, 411],
            [176, 427],
            [158, 442],
            [137, 429],
            [134, 410],
          ],
          gradient(
            [136, 402],
            [173, 440],
            [
              [0, "#ebdaa2"],
              [0.45, "#b38c4e"],
              [1, "#4a5d56"],
            ],
          ),
          "#162f3b",
          6,
        ),
        poly(
          [
            [144, 412],
            [155, 409],
            [165, 420],
            [156, 432],
            [144, 426],
          ],
          "#55c6b5",
          "#cfdfa7",
          2,
        ),
        path(
          [
            ["M", 139, 409],
            ["L", 143, 402],
            ["L", 152, 405],
          ],
          "none",
          "#fff0b8",
          2,
        ),
      ],
    },
    {
      id: "accents",
      name: "Sharp glints",
      visible: true,
      opacity: 1,
      paths: [
        poly(
          [
            [351, 102],
            [355, 118],
            [370, 123],
            [353, 127],
            [348, 144],
            [345, 126],
            [332, 121],
            [347, 119],
          ],
          "#e6fff0",
        ),
        poly(
          [
            [186, 289],
            [189, 299],
            [199, 302],
            [188, 305],
            [185, 314],
            [182, 304],
            [173, 301],
            [182, 298],
          ],
          "#fff4c8",
        ),
        poly(
          [
            [295, 345],
            [298, 351],
            [305, 353],
            [298, 355],
            [296, 363],
            [293, 355],
            [286, 353],
            [293, 351],
          ],
          "#8ee5d3",
        ),
        path(
          [
            ["M", 108, 336],
            ["L", 103, 345],
            ["M", 389, 186],
            ["L", 394, 176],
            ["M", 280, 402],
            ["L", 284, 393],
          ],
          "none",
          "#81c9bf",
          3,
        ),
      ],
    },
  ];
  return validateArt(d);
}
