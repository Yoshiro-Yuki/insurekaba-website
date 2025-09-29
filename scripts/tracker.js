const streakElement = document.getElementById("streak");
const taskSection = document.getElementById("task-section");
const highestStreak = document.getElementById("highestStreak");
const fireElement = document.getElementById("fire");
const taskCompleted = document.getElementById("taskCompleted");
const userName = document.getElementById("userName");

let streakDay = 1;
let username;

const taskPool = [
  "Drink 8 glasses of water",
  "Take a 10-minute walk",
  "Do 15 push-ups",
  "Eat a fruit",
  "Meditate for 5 minutes",
  "Write in your journal",
  "Stretch for 10 minutes",
  "Get 7-8 hours of sleep",
  "Limit screen time before bed",
  "Practice gratitude",
  "Read 10 pages of a book",
  "Avoid junk food for the day"
];

function getRandomTasks(pool, num) {
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, num);
}

function updateFire() {
  const tasks = document.querySelectorAll(".task");
  const checkedCount = Array.from(tasks).filter(task => task.checked).length;
  

  if (checkedCount === 0) {
    fireElement.textContent = "🪵"; // kindling
  } else if (checkedCount === 1) {
    fireElement.textContent = "🪔"
  } else if (checkedCount < tasks.length) {
    fireElement.textContent = "🔥"; // mid fire
  } else if (checkedCount === tasks.length) {
    fireElement.textContent = "💥"; // full fire
  }
}

function updateStreak() {
  const tasks = document.querySelectorAll(".task");
  const allChecked = Array.from(tasks).every(task => task.checked);
  updateFire();

  if (allChecked) {
    fireElement.textContent = "💥"; // show full fire first

    setTimeout(() => {
      streakDay += 1;
      streakElement.textContent = `Day ${streakDay}`;
      highestStreak.textContent = `Highest Day Streak: ${streakDay-1}`
      taskCompleted.textContent = `Number of task completed: ${(streakDay-1)*3}`;
      renderTasks();
      updateFire(); // reset fire after new tasks
    }, 1000); // 1 second delay
  }
}

function renderTasks() {
  taskSection.innerHTML = `<p class="title-label">Tasks:</p>`;
  const tasksForToday = getRandomTasks(taskPool, 3);

  tasksForToday.forEach(taskText => {
    const taskBox = document.createElement("div");
    taskBox.className = "task-box";
    taskBox.innerHTML = `<label><input type="checkbox" class="task"> ${taskText}</label>`;
    taskSection.appendChild(taskBox);
  });

  const tasks = document.querySelectorAll(".task");
  tasks.forEach(task => task.addEventListener("change", updateStreak));

  updateFire(); // initial fire state
}

async function fetchName() {

  try {
    const response = await fetch("/get-username");

    if (!response.ok) {
      throw new Error("Could not fetch username");
    }

    const data = await response.json();
    userName.textContent = `Username: ${data.username}`;

  }
  catch (error) {
    console.error(error);
  }
}

// Initial render
renderTasks();
fetchName();
