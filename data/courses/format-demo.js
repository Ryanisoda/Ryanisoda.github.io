window.QUIZ_BANKS = window.QUIZ_BANKS || {};
window.QUIZ_BANKS["format-demo"] = {
  "schemaVersion": "1.0",
  "course": {
    "id": "format-demo",
    "title": "格式示例（非医学题库）",
    "description": "用于体验各题型与多选提交的8道示例题，不计入预防医学题库。",
    "version": "1.0.0"
  },
  "chapters": [
    {
      "id": "single",
      "title": "单选与共用题示例"
    },
    {
      "id": "multiple",
      "title": "X型多选示例"
    }
  ],
  "questions": [
    {
      "id": "demo-1",
      "chapterId": "single",
      "type": "A1",
      "num": 1,
      "stem": "【格式示例】以下哪个数是偶数？",
      "options": [
        {
          "id": "A",
          "text": "1"
        },
        {
          "id": "B",
          "text": "2"
        },
        {
          "id": "C",
          "text": "3"
        },
        {
          "id": "D",
          "text": "5"
        }
      ],
      "answers": [
        "B"
      ],
      "explanation": "2是本题唯一的偶数。"
    },
    {
      "id": "demo-2",
      "chapterId": "single",
      "type": "A2",
      "num": 2,
      "stem": "【格式示例】有3支笔，又买了2支，现在共有几支？",
      "options": [
        {
          "id": "A",
          "text": "3"
        },
        {
          "id": "B",
          "text": "4"
        },
        {
          "id": "C",
          "text": "5"
        },
        {
          "id": "D",
          "text": "6"
        }
      ],
      "answers": [
        "C"
      ]
    },
    {
      "id": "demo-3",
      "chapterId": "single",
      "type": "A3",
      "num": 3,
      "stem": "【格式示例】甲盒里有多少个球？",
      "options": [
        {
          "id": "A",
          "text": "2个"
        },
        {
          "id": "B",
          "text": "3个"
        },
        {
          "id": "C",
          "text": "4个"
        },
        {
          "id": "D",
          "text": "5个"
        }
      ],
      "answers": [
        "B"
      ],
      "groupId": "boxes-a3",
      "sharedStem": "甲盒有3个球，乙盒有5个球。"
    },
    {
      "id": "demo-4",
      "chapterId": "single",
      "type": "A4",
      "num": 4,
      "stem": "【格式示例】加入2个球后共有多少个？",
      "options": [
        {
          "id": "A",
          "text": "3个"
        },
        {
          "id": "B",
          "text": "4个"
        },
        {
          "id": "C",
          "text": "5个"
        },
        {
          "id": "D",
          "text": "6个"
        }
      ],
      "answers": [
        "C"
      ],
      "groupId": "boxes-a4",
      "sharedStem": "盒中原有3个球，随后又加入2个球。"
    },
    {
      "id": "demo-5",
      "chapterId": "single",
      "type": "B",
      "num": 5,
      "stem": "【格式示例】1+1的结果是？",
      "options": [
        {
          "id": "A",
          "text": "1"
        },
        {
          "id": "B",
          "text": "2"
        },
        {
          "id": "C",
          "text": "3"
        },
        {
          "id": "D",
          "text": "4"
        },
        {
          "id": "E",
          "text": "5"
        }
      ],
      "answers": [
        "B"
      ],
      "groupId": "arithmetic"
    },
    {
      "id": "demo-6",
      "chapterId": "single",
      "type": "B",
      "num": 6,
      "stem": "【格式示例】2+2的结果是？",
      "options": [
        {
          "id": "A",
          "text": "1"
        },
        {
          "id": "B",
          "text": "2"
        },
        {
          "id": "C",
          "text": "3"
        },
        {
          "id": "D",
          "text": "4"
        },
        {
          "id": "E",
          "text": "5"
        }
      ],
      "answers": [
        "D"
      ],
      "groupId": "arithmetic"
    },
    {
      "id": "demo-7",
      "chapterId": "multiple",
      "type": "X",
      "num": 7,
      "stem": "【格式示例·多选】请选择所有偶数。",
      "options": [
        {
          "id": "A",
          "text": "1"
        },
        {
          "id": "B",
          "text": "2"
        },
        {
          "id": "C",
          "text": "3"
        },
        {
          "id": "D",
          "text": "4"
        },
        {
          "id": "E",
          "text": "6"
        }
      ],
      "answers": [
        "B",
        "D",
        "E"
      ],
      "explanation": "2、4、6均为偶数，少选或多选均不正确。"
    },
    {
      "id": "demo-8",
      "chapterId": "multiple",
      "type": "X",
      "num": 8,
      "stem": "【格式示例·多选】请选择所有小于4的数。",
      "options": [
        {
          "id": "A",
          "text": "1"
        },
        {
          "id": "B",
          "text": "2"
        },
        {
          "id": "C",
          "text": "3"
        },
        {
          "id": "D",
          "text": "4"
        },
        {
          "id": "E",
          "text": "5"
        }
      ],
      "answers": [
        "A",
        "B",
        "C"
      ]
    }
  ]
};
