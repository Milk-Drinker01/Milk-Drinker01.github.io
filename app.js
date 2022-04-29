function gohome() 
{
    window.location.href = window.location.origin;
}
function loadContactForm() 
{
    window.location.href = window.location.origin + "/contact/index.html";
}
function viewProjects() 
{
    window.location.href = window.location.origin + "/projects/index.html";
}
function loadInstancerPage() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("milk-instancer").style.display = "block";
}