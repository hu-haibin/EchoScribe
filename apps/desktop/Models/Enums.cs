namespace KoubojianJi.Models;

public enum SegmentStatus
{
    Review,
    Keep,
    Delete
}

public enum JobState
{
    Pending,
    Transcribing,
    Done,
    Error
}

public enum AsrProvider
{
    Local,
    Cloud
}

public enum WorkbenchTool
{
    Select,
    Blade
}

public enum CutReason
{
    SegmentDelete,
    ManualDelete
}
